import { getVerifiedUser, listMonitors, createMonitor, changeMonitor, listSamples, runManualCheck } from '../backend/private-monitors.js';
import { MAX_SITES_PER_USER } from '../backend/monitor-policy.js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Vary','Authorization');
  if(!['GET','POST','PATCH','DELETE'].includes(req.method)) return res.status(405).json({error:'metodo_nao_permitido'});
  let user;
  try { user=await getVerifiedUser(req); }
  catch {return res.status(401).json({error:'Entre com Google para acessar seus sites.'});}
  try {
    const id=typeof req.query?.id==='string'?req.query.id:null;
    if(req.method==='GET'){
      if(id) return res.status(200).json({samples:await listSamples(user.uid,id)});
      return res.status(200).json({sites:await listMonitors(user.uid),limit:MAX_SITES_PER_USER});
    }
    if(req.method==='POST') {
      if (id && req.body?.action === 'check') return res.status(200).json({check:await runManualCheck(user.uid,id)});
      if (id) return res.status(400).json({error:'Ação inválida.'});
      const site=await createMonitor(user.uid,req.body?.name,req.body?.url);
      return res.status(201).json({site});
    }
    if(!id) return res.status(400).json({error:'id_obrigatorio'});
    const action=req.method==='DELETE'?'delete':req.body?.action;
    const result=await changeMonitor(user.uid,id,action,req.body);
    return res.status(200).json({result});
  }catch(e){
    const messages={
      nome_invalido:'Nome precisa ter entre 3 e 60 caracteres.',
      url_invalida:'Informe um endereço HTTPS válido.',
      url_nao_permitida:'O endereço não é permitido. Use uma origem HTTPS pública, sem porta personalizada.',
      somente_origem_https:'Cadastre somente a origem do site, como https://exemplo.com, sem caminhos nem parâmetros.',
      limite_por_usuario:'Limite inicial de três sites por conta.',
      limite_global:'Limite total de monitoramentos em teste atingido.',
      nao_encontrado:'Site não encontrado na sua conta.',
      id_invalido:'Identificador de site inválido.',
      acao_invalida:'Ação não permitida.',
      indicadores_invalidos:'Escolha de um a seis indicadores válidos.',
      aguarde_um_minuto:'Aguarde 60 segundos antes de solicitar outra verificação.',
      monitor_pausado:'Ative o monitoramento antes de verificar.'
    };
    if(messages[e.message]) return res.status(e.message==='nao_encontrado'?404:400).json({error:messages[e.message]});
    console.error('[Meus Sites]',e.message);
    return res.status(503).json({error:'Serviço temporariamente indisponível.'});
  }
}
