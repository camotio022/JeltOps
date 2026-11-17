import {canAdminister,readAdminOverview} from '../backend/monitor-admin.js';
import {getNotificationPreferences, saveNotificationPreferences, markInboxRead, notifyInvitation, notifyMonitorActivity, pushDevice, readInbox} from '../backend/monitor-notifications.js';
import {getProfile, saveProfile, listInvitations, getMonitorTeam, changeTeam} from '../backend/monitor-collaboration.js';
import { getLabDb } from '../backend/lab-store.js';
import { getVerifiedUser, listMonitors, createMonitor, changeMonitor, listSamples, runManualCheck } from '../backend/private-monitors.js';
import { MAX_SITES_PER_USER, privateSchedulerPath } from '../backend/monitor-policy.js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Vary','Authorization');
  if(!['GET','POST','PATCH','DELETE'].includes(req.method)) return res.status(405).json({error:'metodo_nao_permitido'});
  let user;
  try { user=await getVerifiedUser(req); }
  catch {return res.status(401).json({error:'Entre com Google para acessar seus sites.'});}
  try {
    const id=typeof req.query?.id==='string'?req.query.id:null;
    const view = req.query?.view;
    if (view === 'admin') {
      if (!canAdminister(user)) return res.status(403).json({error:'Acesso restrito à administração.'});
      if (req.method !== 'GET') return res.status(405).json({error:'Método não permitido.'});
      return res.status(200).json(await readAdminOverview());
    }
    if (view === 'profile') {
      if (req.method === 'GET') return res.status(200).json({profile:await getProfile(user), invitations:await listInvitations(user), canAdminister:canAdminister(user)});
      if (req.method === 'PATCH') return res.status(200).json({profile:await saveProfile(user,req.body)});
      return res.status(405).json({error:'Método não permitido.'});
    }
    if (view === 'notification-preferences') {
      if (req.method === 'GET') return res.status(200).json({preferences:await getNotificationPreferences(user.uid)});
      if (req.method === 'PATCH') return res.status(200).json({preferences:await saveNotificationPreferences(user.uid,req.body?.preferences)});
      return res.status(405).json({error:'Método não permitido.'});
    }
    if (view === 'notifications') {
      if (req.method === 'GET') {
        const [invitations, inbox] = await Promise.all([listInvitations(user),readInbox(user.uid,req.query.activity)]);
        const {showInvitations,...report} = inbox;
        return res.status(200).json({...report,invitations:showInvitations ? invitations : [],
          focusedInvitation:invitations.find(invite=>invite.siteId===req.query.invitation) ?? null});
      }
      if (req.method === 'PATCH') {
        await markInboxRead(user.uid,req.body?.readThrough);
        return res.status(200).json({ok:true});
      }
    }
    if (view === 'push' && req.method === 'POST') return res.status(200).json(await pushDevice(user,req.body ?? {}));
    if (view === 'team') {
      if (req.method === 'GET') return res.status(200).json(await getMonitorTeam(user,id));
      if (req.method === 'POST') {
        const {inviteEmail,activity,...result} = await changeTeam(user,id,req.body);
        if (inviteEmail) await notifyInvitation(inviteEmail,id);
        await notifyMonitorActivity(activity);
        return res.status(200).json(result);
      }
      return res.status(405).json({error:'Método não permitido.'});
    }
    if (view) return res.status(405).json({error:'Método não permitido.'});
    if(req.method==='GET'){
      if(id) return res.status(200).json(await listSamples(user.uid,id));
      const [sites, lastRun] = await Promise.all([
        listMonitors(user.uid),
        getLabDb().doc(privateSchedulerPath).get()
      ]);
      return res.status(200).json({
        sites,limit:MAX_SITES_PER_USER,
        schedulerLastAtMs:lastRun.data()?.lastStartedAtMs ?? null,
        schedulerPreviousAtMs:lastRun.data()?.previousStartedAtMs ?? null
      });
    }
    if(req.method==='POST') {
      if (id && req.body?.action === 'check') return res.status(200).json({check:await runManualCheck(user,id)});
      if (id) return res.status(400).json({error:'Ação inválida.'});
      const site=await createMonitor(user.uid,req.body?.name,req.body?.url);
      return res.status(201).json({site});
    }
    if(!id) return res.status(400).json({error:'id_obrigatorio'});
    const action=req.method==='DELETE'?'delete':req.body?.action;
    const result=await changeMonitor(user,id,action,req.body);
    return res.status(200).json({result});
  }catch(e){
    const messages={
      preferencias_invalidas:'Escolha um canal válido para cada tipo de notificação.',
      dispositivo_invalido:'Inscrição deste dispositivo inválida.',
      dispositivo_em_uso:'As notificações deste navegador já estão vinculadas a outra conta.',
      push_indisponivel:'O envio de notificações está indisponível.',
      push_teste_intervalo:'Aguarde 30 segundos antes de enviar outro teste.',
      push_falhou:'O serviço de notificações não aceitou o teste. Confira a inscrição e tente novamente.',
      perfil_nome_invalido:'Informe um nome de exibição de 2 a 60 caracteres.',
      foto_invalida:'A foto enviada é inválida ou excede o tamanho permitido.',
      email_convite_invalido:'Informe um endereço de e-mail válido.',
      convite_duplicado:'Essa pessoa já está na equipe ou tem um convite pendente.',
      convite_indisponivel:'Esse convite foi cancelado, respondido ou expirou.',
      limite_equipe:'Este monitor atingiu o limite de 10 convidados ou membros.',
      papel_invalido:'Escolha Operador ou Observador.',
      permissao_monitor:'Sua função não permite esta ação.',
      nome_invalido:'Nome precisa ter entre 3 e 60 caracteres.',
      url_invalida:'Informe um endereço HTTPS válido.',
      url_nao_permitida:'O endereço não é permitido. Use uma origem HTTPS pública, sem porta personalizada.',
      somente_origem_https:'Cadastre somente a origem do site, como https://exemplo.com, sem caminhos nem parâmetros.',
      url_duplicada:'Já existe um monitor para este endereço na sua conta.',
      limite_por_usuario:'Limite inicial de três sites por conta.',
      limite_global:'Limite total de monitoramentos em teste atingido.',
      nao_encontrado:'Site não encontrado na sua conta.',
      id_invalido:'Identificador de site inválido.',
      acao_invalida:'Ação não permitida.',
      indicadores_invalidos:'Escolha de um a seis indicadores válidos.',
      aguarde_um_minuto:'Aguarde 60 segundos antes de solicitar outra verificação.',
      monitor_pausado:'Ative o monitoramento antes de verificar.'
    };
    if(messages[e.message]) return res.status(e.message==='nao_encontrado'?404:e.message==='permissao_monitor'?403:400).json({error:messages[e.message]});
    console.error('[Meus Sites]',e.message);
    return res.status(503).json({error:'Serviço temporariamente indisponível.'});
  }
}
