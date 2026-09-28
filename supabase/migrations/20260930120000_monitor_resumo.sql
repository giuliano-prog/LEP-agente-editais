-- =====================================================================
-- Resumo detalhado da varredura (etapa 2 das melhorias de Editais).
-- Acrescenta contadores por fonte ao histórico e agrupa as linhas de uma
-- mesma execução. Somente acrescenta colunas (idempotente); nada é apagado.
-- A coluna antiga `skipped` continua sendo gravada (bloqueados + falhas).
-- =====================================================================

alter table core.monitor_runs
  add column if not exists found             integer not null default 0,
  add column if not exists duplicates        integer not null default 0,
  add column if not exists updated           integer not null default 0,
  add column if not exists pending_review    integer not null default 0,
  add column if not exists blocked_by_robots integer not null default 0,
  add column if not exists failed            integer not null default 0,
  add column if not exists execution_id      uuid;

comment on column core.monitor_runs.found is 'Links que parecem oportunidades (inclui já conhecidos).';
comment on column core.monitor_runs.duplicates is 'Oportunidades já conhecidas (mesmo link ou mesmo arquivo).';
comment on column core.monitor_runs.updated is 'Oportunidades conhecidas com alteração detectada.';
comment on column core.monitor_runs.pending_review is 'Novas oportunidades aguardando revisão humana.';
comment on column core.monitor_runs.blocked_by_robots is 'Links não lidos por restrição do robots.txt.';
comment on column core.monitor_runs.failed is 'Itens com falha na importação (a fonte continua).';
comment on column core.monitor_runs.execution_id is 'Agrupa as linhas (uma por fonte) de uma mesma execução.';

create index if not exists monitor_runs_execution_idx on core.monitor_runs (execution_id);
