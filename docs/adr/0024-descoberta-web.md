# ADR-0024 — Descoberta web de oportunidades audiovisuais

**Status:** Aceita (2026-09-29)

## Contexto

A varredura (ADR-0012) só lê fontes cadastradas. A LEP precisa achar oportunidades também em instituições que ainda
não conhece, sem encher o painel de editais que não são de audiovisual e sem um segundo pipeline paralelo.

## Decisão

- **Camada nova, pipeline antigo.** `apps/web/src/lib/discovery/run.ts` (`runWebDiscovery`) busca, filtra e decide;
  a importação reaproveita `importOpportunity` (`lib/monitor/run.ts`), o mesmo da varredura: duplicidade por
  endereço/arquivo, classificação da página, impressão digital e avistamentos, cópia original, regulamento em PDF,
  extração com evidência, elegibilidade territorial, deduplicação e Match v2. `editais.origin = 'web_discovery'`.
- **Provedor de busca abstraído** (`SearchProvider`, `lib/discovery/search-provider.ts`). Sem scraping de Google/Bing.
  Adaptador opcional para a Brave Search API, ativado só por variáveis do servidor (`WEB_SEARCH_PROVIDER=brave`,
  `WEB_SEARCH_API_KEY`). Sem provedor, a execução é registrada como `not_configured` e nada é buscado.
- **Consultas em famílias** (`@lep/funding` `discovery/queries.ts`): termos audiovisuais, fontes favoritas, formato ×
  ação e instituições. Limite por execução com rodízio: todas as consultas rodam ao longo do tempo.
- **TEMA ≠ OBJETO** (`discovery/audiovisual.ts`). A decisão é sobre o que o edital financia, seleciona, apoia ou
  premia (produção, desenvolvimento, finalização, distribuição, exibição… de filme, série, documentário, animação,
  obra audiovisual). O tema (esporte, saúde, educação…) nunca exclui. Audiovisual só como registro/divulgação/
  contrapartida não conta. Resultado `yes | no | uncertain`, sempre com motivo e trecho. Palavras-chave só fazem a
  triagem inicial dos resultados de busca.
- **Fonte oficial**: agregador, notícia ou blog descobre; a referência é a página da instituição quando encontrada
  (`discovery/official-source.ts`). Notícia sem link oficial não vira edital. Sem fonte oficial localizada, o
  edital registra a observação para conferência.
- **Sem lixo no painel**: não audiovisual, encerrado ou "não é oportunidade" ficam só em `core.discovery_candidates`
  (registro técnico, visível a administradores, evita reprocessar). Incerto vai para uma fila curta "Para confirmar";
  o administrador importa (mesmo pipeline) ou descarta. Nenhuma lista pública de descartados.
- **Novas fontes**: instituições com oportunidades audiovisuais confirmadas e ainda não monitoradas aparecem em
  Fontes; o cadastro entra PAUSADO (`edital_sources.origin = 'web_discovery'`), para testar e ativar.
- **Favoritas** (`edital_sources.is_favorite`): destaque, prioridade na varredura e consultas próprias; nunca limitam a
  descoberta geral.
- **Custo e segurança**: limites de consultas, resultados e páginas por execução (`WEB_DISCOVERY_*`), intervalo
  mínimo entre consultas, uma nova tentativa só em falha transitória, parada em cota/chave recusada, 50 s por
  execução; downloads só por `safeFetch` (anti-SSRF, redirecionamentos revalidados, limites) e `robots.txt`; chave
  só no servidor, enviada em cabeçalho e nunca repassada em redirecionamento para outro domínio.
- **Proteção de custo (migração `20261009120000`)**: teto rígido de chamadas por execução e teto mensal por
  organização em `core.search_api_usage`, com reserva atômica (`core.reserve_search_request`) ANTES de cada chamada
  (toda tentativa conta; reserva recusada ou com erro = não chama). Até 5 consultas × 20 resultados (1 página por
  padrão; 2ª página só com `more_results_available` e após confirmar o `offset` da Brave, ainda não verificado),
  teto de 100 resultados brutos. A triagem barata exige sinal de produto audiovisual antes de qualquer download.
- **Execução**: botão "Buscar novas oportunidades" (admin) e rota `/api/cron/discovery` com a mesma função. A rota
  ainda **não está agendada** em `vercel.json`.
- **Métricas** por execução em `core.discovery_runs`.

## Consequências

- Para ligar: escolher/contratar o provedor (a LEP decide; pode ter custo), configurar as variáveis na Vercel,
  testar pelo botão e só então agendar o cron.
- Regras de relevância audiovisual são determinísticas: casos novos entram no benchmark (`expected.audiovisual`)
  antes de ajustar os padrões.
- Nenhuma validação com o provedor real nem com sites reais foi feita neste repositório.
