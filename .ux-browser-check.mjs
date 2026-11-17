import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.JELTOPS_CHROMIUM_PATH,args:['--no-sandbox']});
const names=['Triamicci com um nome muito comprido para testar a lista','JeltOps','Site pausado'];
const fixtures=names.map((name,i)=>({id:String(i+1),name,url:'https://example.com',enabled:i!==2,metrics:['status','latency','success']}));
const row=(id,statusCode,offset=0)=>({id,statusCode,status:statusCode===200?'UP':statusCode===503?'DOWN':'UNKNOWN',latencyMs:50,timestamp:new Date(Date.now()-offset).toISOString()});
let sites=fixtures,samples={'1':[row('failed',503),row('old',200,60000)],'2':[row('unknown',0)],'3':[row('paused',200)]};
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/meus-sites*',async route=>{
  const req=route.request(),id=new URL(req.url()).searchParams.get('id');
  if(req.method()==='POST'&&id){
    if(id==='2')return route.fulfill({status:503,json:{error:'Conexão indisponível. Tente novamente.'}});
    samples[id]=[row('recovered',200),...samples[id]];
    return route.fulfill({json:{check:samples[id][0]}});
  }
  if(req.method()==='POST'){
    const site={...fixtures[0],id:'new',...req.postDataJSON()};
    sites=[site];samples.new=[row('first',200)];
    return route.fulfill({json:{site}});
  }
  return route.fulfill({json:id?{samples:samples[id]||[]}:{sites}});
});
let demoMode='failure';
await page.route('**/api/lab-observe',route=>route.fulfill({json:{
  runId:'lab',endsAtMs:Date.now()+20000,serverNowMs:Date.now(),
  observedChecks:[
    {...row('b',200,4000),observedAtMs:Date.now()-4000,phase:'baseline'},
    {...row('o',503,2000),observedAtMs:Date.now()-2000,phase:'outage'},
    ...(demoMode==='recovery'?[{...row('r',200),observedAtMs:Date.now(),phase:'recovery'}]:[])
  ]
}}));
const go=async()=>{
  await page.goto('http://127.0.0.1:4254/');
  await page.getByRole('button',{name:'Meus sites',exact:true}).filter({visible:true}).first().click();
};
await go();
const list=page.locator('.mine-compact-list');
await list.getByText('Indisponível',{exact:true}).waitFor();
assert.match(await list.innerText(),/Inconclusivo.*Pausado/s);
assert.equal(await page.locator('.mine-detail').count(),0);
assert.equal(await page.locator('.mine-executive').count(),0);
const details=list.getByRole('button',{name:new RegExp(names[0])}).first();
await details.focus();await page.keyboard.press('Enter');
assert.equal(await page.locator('.mine-detail h3').evaluate(e=>document.activeElement===e),true);
await page.getByRole('button',{name:'Fechar detalhes',exact:true}).focus();await page.keyboard.press('Enter');
assert.equal(await details.evaluate(e=>document.activeElement===e),true);
assert.equal(await list.getByRole('button',{name:'Verificar agora: Site pausado'}).isDisabled(),true);
await list.getByRole('button',{name:'Verificar agora: JeltOps'}).click();
await page.getByText('JeltOps: Conexão indisponível. Tente novamente.').waitFor();
await list.getByRole('button',{name:'Verificar agora: '+names[0]}).click();
await page.getByText('Recuperação observada',{exact:true}).waitFor();
await list.getByText('Disponível',{exact:true}).waitFor();
const contrast=async()=>list.locator('.mine-compact-name small').first().evaluate(e=>{
  const luminance=v=>{
    const channels=v.match(/[\d.]+/g).slice(0,3).map(n=>Number(n)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
    return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
  };
  const fg=luminance(getComputedStyle(e).color),bg=luminance(getComputedStyle(e.closest('ul')).backgroundColor);
  return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
});
for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:844});
  if(width<=640){
    await list.waitFor();
    assert.ok(await list.evaluate(e=>e.getBoundingClientRect().right<=innerWidth));
    assert.ok(await list.getByRole('button',{name:'Verificar agora: JeltOps'}).evaluate(e=>e.getBoundingClientRect().width>=44&&e.getBoundingClientRect().height>=44));
  } else await page.getByRole('region',{name:'Visão executiva dos seus sites'}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+width);
}
await page.setViewportSize({width:390,height:844});
await list.waitFor();
const dark=await contrast();
await page.getByRole('button',{name:'Ativar modo claro'}).filter({visible:true}).first().click();
const light=await contrast();
console.log('Contraste do texto secundário na lista: '+dark.toFixed(2)+' escuro / '+light.toFixed(2)+' claro');
assert.ok(dark>=4.5&&light>=4.5);
sites=[];samples={};
await go();
await page.getByRole('button',{name:'Adicionar meu primeiro site'}).click();
await page.getByLabel('Nome do site').fill('Meu primeiro site');
await page.getByLabel('Endereço HTTPS público').fill('https://example.org');
await page.getByRole('button',{name:'Cadastrar site'}).click();
await page.locator('.mine-compact-list').getByText('Disponível',{exact:true}).waitFor();
await page.setViewportSize({width:1280,height:900});
await page.getByRole('button',{name:'Visão geral',exact:true}).filter({visible:true}).first().click();
await page.getByRole('button',{name:'Acompanhar demonstração'}).click();
await page.getByRole('timer').waitFor();
assert.ok(await page.locator('.command-hero-signal').evaluate(e=>e.classList.contains('degraded')));
demoMode='recovery';
await page.getByText('● Recuperado',{exact:true}).waitFor();
assert.ok(await page.locator('.command-hero-signal').evaluate(e=>e.classList.contains('ok')));
assert.equal(errors.length,0,errors.join('\n'));
console.log('Chromium: 320/390/768/1280 px, teclado, ação de checar, erro, retorno, cadastro, pausa e demo passaram.');
await browser.close();
