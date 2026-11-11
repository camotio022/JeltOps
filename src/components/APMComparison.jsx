import '../styles/APMComparison.css';

const integrations = [
  { name: 'Prometheus', type: 'Métricas', detail: 'Exportação de métricas em formato Prometheus. Requer um coletor ativo e rota acessível ao scraper.' },
  { name: 'Elasticsearch', type: 'Logs', detail: 'Indexação de eventos para pesquisa e análise. A existência do módulo não comprova uma conexão configurada.' },
  { name: 'Sentry', type: 'Erros', detail: 'Rastreamento de falhas do processo monitorador quando o DSN está configurado.' }
];

export default function APMComparison() {
  return (
    <section className="integrations-page" aria-label="Integrações de observabilidade">
      <div className="integrations-intro">
        <span className="eyebrow">ECOSSISTEMA DE OBSERVABILIDADE</span>
        <h2>Integrações</h2>
        <p>A coleta HTTP, DNS e TCP do JeltOps funciona independentemente destes conectores. Os status abaixo não são verificados pelo navegador: a confirmação depende de testes no servidor.</p>
      </div>
      <div className="integrations-grid">
        {integrations.map((item) => (
          <article className="integration-card" key={item.name}>
            <div className="integration-card-top">
              <span className="integration-type">{item.type}</span>
              <span className="integration-unverified">Não verificado</span>
            </div>
            <h3>{item.name}</h3>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
      <div className="integration-note" role="note">
        <strong>Sobre a validação acadêmica</strong>
        <p>Não usamos respostas demonstrativas ou serviços locais como evidência de integração real. Cada conector deverá ter logs, métricas ou eventos verificáveis em seu respectivo ambiente.</p>
      </div>
    </section>
  );
}
