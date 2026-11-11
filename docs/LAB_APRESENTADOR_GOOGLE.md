# Autorização Google do Laboratório JeltOps

O botão **Provocar falha agora** exige login Google verificado por Firebase Authentication e permissão explícita de apresentador no Firestore.

## Habilitação inicial (administrador)

1. Entre no JeltOps com a conta Google que realizará a apresentação.
2. No **Firebase Console > Authentication > Users**, localize o **UID** dessa conta.
3. No **Firestore Console**, crie **lab_presenters / <UID>** com o campo booleano **enabled: true**. Essa configuração é administrativa, nunca feita pelo navegador.
4. Volte ao Laboratório. Clique **Gerar código temporário**, copie o código exibido na própria sessão e confirme-o para iniciar a falha.
5. Somente o serviço `/api/lab-target` responde 503 por 30 segundos. Sites de terceiros e métricas reais não são afetados.

A permissão é conferida **no backend em toda solicitação**, não bastando alterar o navegador. Revogue removendo o documento ou definindo `enabled: false`.

## Segurança e limites

- Código de seis dígitos expira em cinco minutos, só pode iniciar **um** experimento e tem **cinco tentativas**; emitir novamente exige 30 segundos de intervalo.
- O código é exibido para o apresentador já autenticado. **Não é um segundo fator de autenticação** nem substitui um aplicativo autenticador; é uma confirmação temporária vinculada à sessão Google e à permissão do servidor.
- Em produção, desative `LAB_TEST_ENABLED` quando não houver demonstrações.
- `LAB_CONTROL_TOKEN` não é mais utilizado pelo novo endpoint; uma remoção futura do ambiente pode ser feita após homologar o fluxo Google.
- Os relatórios experimentais permanecem separados em `lab_experiments`; falhas provocadas não alteram `metrics_logs`.
- A detecção externa de HTTP 503 / HTTP 200 depende da rota `/api/lab-observe` e de validação ponta a ponta no deployment da Vercel.
