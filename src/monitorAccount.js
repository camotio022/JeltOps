import {auth} from './firebaseConfig';

export async function monitorRequest(path='/api/meus-sites', options={}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Entre com sua conta Google.');
  const token = await user.getIdToken();
  const response = await fetch(path, {...options,cache:'no-store',headers:{
    Accept:'application/json',Authorization:'Bearer '+token,
    ...(options.body?{'Content-Type':'application/json'}:{}),...options.headers
  }});
  const body = await response.json().catch(()=>null);
  if (!response.ok) throw new Error(body?.error || body?.message ||
    (response.status===401?'Sessão expirada. Entre novamente.':'Não foi possível concluir. Tente novamente.'));
  return body || {};
}

export const roleLabels = {owner:'Dono',operator:'Operador',viewer:'Observador'};


export const activityLabels = {
  inviteAccepted:'Convite aceito', inviteDeclined:'Convite recusado',
  paused:'Monitor pausado', resumed:'Monitor reativado',
  down:'Serviço indisponível', recovered:'Serviço recuperado', unknown:'Verificação inconclusiva',
  manualCheck:'Verificação manual'
};
