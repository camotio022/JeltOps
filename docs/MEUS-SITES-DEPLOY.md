# Meus Sites — ativação e validação

## Arquitetura
- Google Firebase Authentication para autenticar o proprietário.
- `GET/POST/PATCH/DELETE /api/meus-sites` com `Authorization: Bearer <Firebase ID token>`.
- Até 3 sites por usuário; limite global de 12 para o piloto, limitado por transações.
- URLs aceitas: origem HTTPS pública (`https://dominio.com`), somente porta 443.
- DNS A checado contra redes reservadas; IP público validado é fixado na conexão TLS.
- Sem redirecionamentos; limite 8s; apenas respostas/status, nunca corpo completo.
- Cada site guarda seu histórico em `private_monitors/{id}/samples`. O dashboard público nunca acessa essa coleção.
- O backend mantém referências Google/YouTube em `metrics_logs`. Nenhuma consulta privada é exposta no endpoint público.
- Cada tick do agendador existente verifica os sites, grava apenas mudança de status/código ou heartbeat de 10 minutos.
- Ao cadastrar, a primeira verificação acontece imediatamente.
- A cada execução do monitor existe um bloqueio (lease) no Firestore para impedir chamadas extras de verificar várias vezes por minuto.

## Etapas externas OBRIGATÓRIAS
1. Firebase Console > Authentication > Sign-in method: ativar Google.
2. Firebase Console > Authentication > Settings > Authorized domains: permitir `jeltops.vercel.app` e o domínio realmente usado.
3. Firebase Console > Firestore > Rules: revisar regras existentes e implantar as políticas de `firestore.rules`. O arquivo no GitHub não aplica regras automaticamente. **Antes de liberar acesso a usuários reais, confirmar que `private_monitors` e `system` não podem ser lidos ou escritos pelos clientes, inclusive clientes autenticados de outras contas.**
4. cron-job.org: confirmar o agendamento desejado de 1 minuto para `/api/monitor`. O código não consegue alterar automaticamente o agendamento externo.

## Sobre os indicadores
As métricas são fixas e auditáveis (último estado, latência média, proporção de amostras positivas); o usuário personaliza o endpoint em destaque. A taxa de amostras positivas NÃO representa disponibilidade temporal durante o período de 10 minutos de heartbeat.

## Homologação
- Login Google no Safari e PWA instalado.
- Um usuário cadastra um HTTPS próprio, recebe primeira amostra.
- Outro usuário NÃO deve conseguir listar, consultar ou excluir monitoramentos do primeiro.
- URLs IP, localhost, link-local, domínio com caminho/porta, HTTP e URLs com credenciais são rejeitadas.
- Pausar, ativar e excluir; excluir remove histórico. Contadores globais e individuais permanecem consistentes.
- Verificar limites de 3 por usuário e 12 globais.
- Validar cron e leituras/gravações do Firebase antes de escala real.
