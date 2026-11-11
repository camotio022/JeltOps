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

## Modo de demonstração repetível (preview)

A branch de teste agora usa `LAB_ENABLED=true` e `LAB_MODE=cycle` no escopo **preview desta branch**. Neste modo a rota `/api/lab-target` alterna automaticamente, sempre em UTC:

- Minutos 00–09 de cada ciclo de 30 minutos: `HEALTHY` / HTTP 200;
- Minutos 10–19: `SIMULATED_OUTAGE` / HTTP 503;
- Minutos 20–29: `RECOVERED` / HTTP 200.

A fase é computada pelo relógio do servidor e não exige processo em execução contínua; cada requisição responde conforme o momento. A recuperação não significa que o JeltOps consertou o site, e sim que o serviço de laboratório voltou a responder.

**Atenção:** isso habilita apenas o site de laboratório no preview. Não há cron independente de preview nem isolamento de Firestore confirmado; por isso ainda não foi ativado o alvo opcional no monitor de preview. Não acionar o monitor do preview com dados reais de produção.

## Verificação mobile e PWA

- Testar em iPhone, Android e desktop: página inicial, filtro de alvo, gráficos, cards de histórico, paginação e tema.
- Verificar instalação em Adicionar à Tela de Início / Instalar Aplicativo e abrir standalone.
- Testar offline: mostrar tela de indisponibilidade quando o app nunca abriu antes, sem exibir métricas antigas como se fossem novas.
- Validar safe areas e teclado, contraste, foco visível e atualização ao receber novos registros.
- O build gera `icon-180.png`, `icon-192.png` e `icon-512.png`; arquivos são criados em tempo de build, sem necessidade de comitar binários.
