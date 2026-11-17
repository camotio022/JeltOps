export const notificationCategories = [
  {id:'invitations',label:'Convites recebidos',kinds:['invitation'],defaultMode:'both'},
  {id:'responses',label:'Respostas a convites',kinds:['inviteAccepted','inviteDeclined'],defaultMode:'both'},
  {id:'monitorControl',label:'Pausa e reativação',kinds:['paused','resumed'],defaultMode:'both'},
  {id:'availability',label:'Falhas e checagens inconclusivas',kinds:['down','unknown'],defaultMode:'both'},
  {id:'recovery',label:'Recuperação do serviço',kinds:['recovered'],defaultMode:'both'},
  {id:'manualChecks',label:'Verificações manuais',kinds:['manualCheck'],defaultMode:'inbox'}
];

export const notificationModes = {
  off:'Desativado', inbox:'Só no sino', push:'Só no dispositivo', both:'Sino e dispositivo'
};

export function normalizePreferences(stored) {
  return Object.fromEntries(notificationCategories.map(({id,defaultMode})=>[
    id, Object.hasOwn(notificationModes,stored?.[id]) ? stored[id] : defaultMode
  ]));
}

export function allowsNotification(preferences,kind,channel) {
  const category = notificationCategories.find(item=>item.kinds.includes(kind));
  if (!category) return false;
  const mode = preferences[category.id];
  return mode === 'both' || mode === channel;
}
