# JeltOps — laboratório de falha e recuperação

Branch isolada: `feature/lab-falha-recuperacao-20261111`. Não modificar produção antes de verificar o fluxo.

## Configuração preview
1. Fazer deploy em preview acessível (verificar proteção SSO).
2. Configurar somente no preview: `LAB_ENABLED=true` e `LAB_START_AT=<horário ISO 8601 UTC futuro>`.
3. `GET /api/lab-target` retorna 200 até 2 minutos após o início, 503 nos 12 minutos seguintes, e 200 automaticamente após 14 minutos.
4. Para monitorá-lo pelo JeltOps é necessário incluir o alvo **somente na função monitoradora de preview**, via `JELTOPS_LAB_TARGET_URL` após avaliação de segurança. Não reutilizar o job cron de produção.
5. Para o monitor de preview, configurar `JELTOPS_MONITOR_TOKEN` como segredo forte. O código exige o header `x-jeltops-monitor-token` quando `LAB_ENABLED=true`; usar somente no agendador de teste (não colocar token na URL). Limitar chamadas. Separar os registros Firebase de preview e produção.
6. Teste de unidade: `node --test tests/lab-target.test.mjs`.

## Evidências acadêmicas
Registrar o JSON da função com `phase=HEALTHY`, depois `SIMULATED_OUTAGE`, depois `RECOVERED`. Depois, se o monitor de preview estiver isolado e configurado, anexar os três registros correspondentes (UP, DOWN, UP) e capturas do dashboard. Anotar horário agendado e horário real da primeira detecção, distinguindo resolução da simulação e detecção pelo monitor.

**Importante:** a recuperação automática é comportamento simulado do site controlado; JeltOps detecta a recuperação, não repara sites de terceiros.
