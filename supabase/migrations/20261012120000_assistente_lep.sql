-- =====================================================================
-- Assistente LEP — agente de IA operacional da Área de Trabalho (ADR-0027).
--
-- Reaproveita a Área de Trabalho (ADR-0026): o agente escreve no MESMO checklist
-- (core.edital_workspace_items) e no acervo; aqui entram só as estruturas novas:
--
-- • core.edital_texts: texto do edital POR PÁGINA (cache da extração, base das
--   evidências "documento · página · trecho" e de uma futura memória/RAG).
-- • core.assistant_conversations / core.assistant_messages: conversa persistida
--   por área de trabalho (compartilhada pela equipe; cada mensagem tem autor).
-- • core.agent_runs: cada pedido ao agente vira uma execução persistida, avançada
--   passo a passo (status, fase, transcrição da API, tokens, custo, erro).
-- • core.agent_actions: auditoria de CADA ferramenta usada (entrada, antes/depois,
--   evidência, confiança, erro) e as propostas que exigem confirmação humana.
-- • core.workspace_findings: achados do agente/equipe (inconsistências, riscos,
--   decisões pendentes, critérios, oportunidades...), deduplicados por chave.
-- • Itens do checklist ganham evidência estruturada, confiança, origem da
--   informação, "alterado via" (usuário × assistente) e sugestão de texto da IA.
-- • core.ai_usage NÃO muda: custo por chamada continua gravado só pelo servidor
--   (ADR-0006); os totais por execução ficam em core.agent_runs.
--
-- Permissões: Equipe (viewer) consulta; Diretoria (editor) e ADM usam o agente.
-- edital_id usa o tipo de core.editais.id. Idempotente (ADR-0014).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Vocabulário comum de confiança e origem da informação
-- ---------------------------------------------------------------------
-- confirmed | inferred | not_found | needs_human
-- edital | lep | production | ai_inference | team

-- ---------------------------------------------------------------------
-- Itens do checklist: evidência, confiança, origem e autoria (usuário × IA)
-- ---------------------------------------------------------------------
alter table core.edital_workspace_items
  add column if not exists confidence         text,
  add column if not exists source_kind        text,
  add column if not exists evidence_document  text,
  add column if not exists evidence_page      integer,
  add column if not exists evidence_section   text,
  add column if not exists analyzed_at        timestamptz,
  add column if not exists updated_via        text not null default 'user',
  add column if not exists ai_suggestion      text,
  add column if not exists ai_suggestion_at   timestamptz;

alter table core.edital_workspace_items drop constraint if exists edital_workspace_items_confidence_check;
alter table core.edital_workspace_items
  add constraint edital_workspace_items_confidence_check
  check (confidence is null or confidence in ('confirmed', 'inferred', 'not_found', 'needs_human'));
alter table core.edital_workspace_items drop constraint if exists edital_workspace_items_source_kind_check;
alter table core.edital_workspace_items
  add constraint edital_workspace_items_source_kind_check
  check (source_kind is null or source_kind in ('edital', 'lep', 'production', 'ai_inference', 'team'));
alter table core.edital_workspace_items drop constraint if exists edital_workspace_items_updated_via_check;
alter table core.edital_workspace_items
  add constraint edital_workspace_items_updated_via_check check (updated_via in ('user', 'assistant'));
alter table core.edital_workspace_items drop constraint if exists edital_workspace_items_evidence_check;
alter table core.edital_workspace_items
  add constraint edital_workspace_items_evidence_check
  check (
    (evidence_document is null or char_length(evidence_document) <= 300)
    and (evidence_section is null or char_length(evidence_section) <= 300)
    and (evidence_page is null or evidence_page > 0)
    and (ai_suggestion is null or char_length(ai_suggestion) <= 50000)
  );

comment on column core.edital_workspace_items.confidence is 'Confiança da informação: confirmed | inferred | not_found | needs_human.';
comment on column core.edital_workspace_items.source_kind is 'Origem: edital | lep | production | ai_inference | team.';
comment on column core.edital_workspace_items.updated_via is 'Última alteração feita pela equipe (user) ou pelo Assistente LEP (assistant).';
comment on column core.edital_workspace_items.ai_suggestion is 'Sugestão de texto do Assistente (não substitui o texto da equipe sem confirmação).';

grant insert (confidence, source_kind, evidence_document, evidence_page, evidence_section, analyzed_at,
              updated_via, ai_suggestion, ai_suggestion_at)
  on core.edital_workspace_items to authenticated;
grant update (confidence, source_kind, evidence_document, evidence_page, evidence_section, analyzed_at,
              updated_via, ai_suggestion, ai_suggestion_at)
  on core.edital_workspace_items to authenticated;

-- ---------------------------------------------------------------------
-- core.edital_texts — texto do edital por página (cache da extração)
-- ---------------------------------------------------------------------
do $$
declare
  v_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_id_type
  from pg_attribute a
  where a.attrelid = 'core.editais'::regclass and a.attname = 'id' and not a.attisdropped;

  execute format($ddl$
    create table if not exists core.edital_texts (
      id            uuid primary key default gen_random_uuid(),
      org_id        uuid not null references core.organizations (id) on delete cascade,
      edital_id     %s not null references core.editais (id) on delete cascade,
      document_id   uuid references core.edital_documents (id) on delete cascade,
      source        text not null check (source in ('pdf', 'page', 'fields')),
      label         text not null check (char_length(label) between 1 and 300),
      sha256        text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
      pages         jsonb not null default '[]'::jsonb check (jsonb_typeof(pages) = 'array'),
      page_count    integer not null default 0 check (page_count >= 0),
      char_count    integer not null default 0 check (char_count >= 0),
      truncated     boolean not null default false,
      extracted_at  timestamptz not null default now()
    )
  $ddl$, v_id_type);
end;
$$;

create unique index if not exists edital_texts_document_key on core.edital_texts (document_id) where document_id is not null;
create unique index if not exists edital_texts_fields_key on core.edital_texts (edital_id) where document_id is null;
create index if not exists edital_texts_edital_idx on core.edital_texts (edital_id);

comment on table core.edital_texts is 'Texto extraído dos documentos do edital, por página (evidências do Assistente; base de memória futura).';

alter table core.edital_texts enable row level security;

drop policy if exists "edital_texts_select_members" on core.edital_texts;
create policy "edital_texts_select_members" on core.edital_texts
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "edital_texts_insert_editors" on core.edital_texts;
create policy "edital_texts_insert_editors" on core.edital_texts
  for insert to authenticated
  with check (
    core.has_role(org_id, 'editor')
    and exists (select 1 from core.editais e where e.id = edital_id and e.org_id = edital_texts.org_id)
    and (document_id is null or exists (
      select 1 from core.edital_documents d
      where d.id = document_id and d.org_id = edital_texts.org_id and d.edital_id = edital_texts.edital_id))
  );
drop policy if exists "edital_texts_update_editors" on core.edital_texts;
create policy "edital_texts_update_editors" on core.edital_texts
  for update to authenticated
  using (core.has_role(org_id, 'editor'))
  with check (core.has_role(org_id, 'editor'));
drop policy if exists "edital_texts_delete_editors" on core.edital_texts;
create policy "edital_texts_delete_editors" on core.edital_texts
  for delete to authenticated using (core.has_role(org_id, 'editor'));

grant select, delete on core.edital_texts to authenticated;
grant insert (id, org_id, edital_id, document_id, source, label, sha256, pages, page_count, char_count, truncated)
  on core.edital_texts to authenticated;
grant update (label, sha256, pages, page_count, char_count, truncated, extracted_at) on core.edital_texts to authenticated;
grant all on core.edital_texts to service_role;

-- ---------------------------------------------------------------------
-- core.assistant_conversations — uma conversa por área de trabalho
-- ---------------------------------------------------------------------
create table if not exists core.assistant_conversations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references core.organizations (id) on delete cascade,
  workspace_id  uuid not null references core.edital_workspaces (id) on delete cascade,
  summary       text check (summary is null or char_length(summary) <= 8000),
  created_by    uuid references core.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists assistant_conversations_workspace_key on core.assistant_conversations (workspace_id);

comment on table core.assistant_conversations is 'Conversa do Assistente LEP vinculada à inscrição (área de trabalho). Resumo consolidado para contexto.';

drop trigger if exists assistant_conversations_set_updated_at on core.assistant_conversations;
create trigger assistant_conversations_set_updated_at before update on core.assistant_conversations
  for each row execute function core.set_updated_at();

alter table core.assistant_conversations enable row level security;

drop policy if exists "assistant_conversations_select_members" on core.assistant_conversations;
create policy "assistant_conversations_select_members" on core.assistant_conversations
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "assistant_conversations_insert_editors" on core.assistant_conversations;
create policy "assistant_conversations_insert_editors" on core.assistant_conversations
  for insert to authenticated
  with check (
    core.has_role(org_id, 'editor')
    and exists (select 1 from core.edital_workspaces w where w.id = workspace_id and w.org_id = assistant_conversations.org_id)
  );
drop policy if exists "assistant_conversations_update_editors" on core.assistant_conversations;
create policy "assistant_conversations_update_editors" on core.assistant_conversations
  for update to authenticated
  using (core.has_role(org_id, 'editor'))
  with check (core.has_role(org_id, 'editor'));

grant select on core.assistant_conversations to authenticated;
grant insert (id, org_id, workspace_id, summary) on core.assistant_conversations to authenticated;
grant update (summary) on core.assistant_conversations to authenticated;
grant all on core.assistant_conversations to service_role;

-- ---------------------------------------------------------------------
-- core.agent_runs — execuções do agente (uma por pedido)
-- ---------------------------------------------------------------------
create table if not exists core.agent_runs (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references core.organizations (id) on delete cascade,
  conversation_id     uuid not null references core.assistant_conversations (id) on delete cascade,
  workspace_id        uuid not null references core.edital_workspaces (id) on delete cascade,
  kind                text not null default 'chat' check (kind in ('chat', 'full_analysis')),
  status              text not null default 'queued'
                      check (status in ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  phase               text check (phase is null or char_length(phase) <= 200),
  request             text not null check (char_length(request) between 1 and 8000),
  provider            text,
  model               text,
  transcript          jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript) = 'array'),
  step_count          integer not null default 0 check (step_count >= 0),
  max_steps           integer not null default 12 check (max_steps between 1 and 60),
  tool_calls          integer not null default 0 check (tool_calls >= 0),
  input_tokens        integer not null default 0 check (input_tokens >= 0),
  output_tokens       integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens   integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens  integer not null default 0 check (cache_write_tokens >= 0),
  cost_usd            numeric(12, 6) not null default 0 check (cost_usd >= 0),
  attempts            integer not null default 0 check (attempts >= 0),
  error               text check (error is null or char_length(error) <= 2000),
  result              jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  lease_until         timestamptz,
  started_by          uuid references core.profiles (id) on delete set null default auth.uid(),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  updated_at          timestamptz not null default now()
);

create index if not exists agent_runs_conversation_idx on core.agent_runs (conversation_id, started_at desc);
create index if not exists agent_runs_workspace_status_idx on core.agent_runs (workspace_id, status);

comment on table core.agent_runs is 'Execuções do Assistente LEP: status, fase, transcrição da API (só desta execução), tokens, custo e erro.';
comment on column core.agent_runs.lease_until is 'Trava curta de passo: impede dois passos simultâneos da mesma execução.';

drop trigger if exists agent_runs_set_updated_at on core.agent_runs;
create trigger agent_runs_set_updated_at before update on core.agent_runs
  for each row execute function core.set_updated_at();

alter table core.agent_runs enable row level security;

drop policy if exists "agent_runs_select_members" on core.agent_runs;
create policy "agent_runs_select_members" on core.agent_runs
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "agent_runs_insert_editors" on core.agent_runs;
create policy "agent_runs_insert_editors" on core.agent_runs
  for insert to authenticated
  with check (
    core.has_role(org_id, 'editor')
    and exists (
      select 1 from core.assistant_conversations c
      where c.id = conversation_id and c.org_id = agent_runs.org_id and c.workspace_id = agent_runs.workspace_id)
  );
drop policy if exists "agent_runs_update_editors" on core.agent_runs;
create policy "agent_runs_update_editors" on core.agent_runs
  for update to authenticated
  using (core.has_role(org_id, 'editor'))
  with check (core.has_role(org_id, 'editor'));

grant select on core.agent_runs to authenticated;
grant insert (id, org_id, conversation_id, workspace_id, kind, status, phase, request, provider, model, max_steps)
  on core.agent_runs to authenticated;
grant update (status, phase, provider, model, transcript, step_count, tool_calls, input_tokens, output_tokens,
              cache_read_tokens, cache_write_tokens, cost_usd, attempts, error, result, lease_until, finished_at)
  on core.agent_runs to authenticated;
grant all on core.agent_runs to service_role;

-- ---------------------------------------------------------------------
-- core.assistant_messages — mensagens visíveis da conversa (append-only)
-- ---------------------------------------------------------------------
create table if not exists core.assistant_messages (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references core.organizations (id) on delete cascade,
  conversation_id  uuid not null references core.assistant_conversations (id) on delete cascade,
  run_id           uuid references core.agent_runs (id) on delete set null,
  role             text not null check (role in ('user', 'assistant', 'notice')),
  content          text not null check (char_length(content) between 1 and 40000),
  author_id        uuid references core.profiles (id) on delete set null,
  metadata         jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at       timestamptz not null default now()
);

create index if not exists assistant_messages_conversation_idx on core.assistant_messages (conversation_id, created_at);

comment on table core.assistant_messages is 'Mensagens da conversa com o Assistente LEP (pedido da pessoa, resposta do agente, avisos).';

alter table core.assistant_messages enable row level security;

drop policy if exists "assistant_messages_select_members" on core.assistant_messages;
create policy "assistant_messages_select_members" on core.assistant_messages
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "assistant_messages_insert_editors" on core.assistant_messages;
create policy "assistant_messages_insert_editors" on core.assistant_messages
  for insert to authenticated
  with check (
    core.has_role(org_id, 'editor')
    and exists (select 1 from core.assistant_conversations c where c.id = conversation_id and c.org_id = assistant_messages.org_id)
    and (run_id is null or exists (
      select 1 from core.agent_runs r where r.id = run_id and r.conversation_id = assistant_messages.conversation_id))
    -- mensagem de pessoa só em nome de quem está logado; do agente, sem autor
    and (author_id is null or author_id = (select auth.uid()))
  );

grant select on core.assistant_messages to authenticated;
grant insert (id, org_id, conversation_id, run_id, role, content, author_id, metadata)
  on core.assistant_messages to authenticated;
grant all on core.assistant_messages to service_role;

-- ---------------------------------------------------------------------
-- core.workspace_findings — achados (agente ou equipe), deduplicados por chave
-- ---------------------------------------------------------------------
create table if not exists core.workspace_findings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references core.organizations (id) on delete cascade,
  workspace_id  uuid not null references core.edital_workspaces (id) on delete cascade,
  kind          text not null check (kind in ('inconsistency', 'risk', 'pending_decision', 'observation',
                                              'recommendation', 'evaluation_criterion', 'scoring_opportunity')),
  dedupe_key    text not null check (char_length(dedupe_key) between 1 and 120),
  title         text not null check (char_length(title) between 2 and 300),
  detail        text check (detail is null or char_length(detail) <= 4000),
  severity      text not null default 'medium' check (severity in ('high', 'medium', 'low', 'info')),
  status        text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  confidence    text not null default 'inferred' check (confidence in ('confirmed', 'inferred', 'not_found', 'needs_human')),
  source_kind   text not null default 'ai_inference' check (source_kind in ('edital', 'lep', 'production', 'ai_inference', 'team')),
  evidence      jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  points        numeric(8, 2) check (points is null or points >= 0),
  item_id       uuid references core.edital_workspace_items (id) on delete set null,
  created_via   text not null default 'assistant' check (created_via in ('assistant', 'user')),
  run_id        uuid references core.agent_runs (id) on delete set null,
  resolution    text check (resolution is null or char_length(resolution) <= 2000),
  resolved_by   uuid references core.profiles (id) on delete set null,
  resolved_at   timestamptz,
  created_by    uuid references core.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists workspace_findings_dedupe_key on core.workspace_findings (workspace_id, kind, dedupe_key);
create index if not exists workspace_findings_open_idx on core.workspace_findings (workspace_id, status, kind);

comment on table core.workspace_findings is 'Achados da inscrição: inconsistências, riscos, decisões pendentes, critérios, oportunidades (com evidência e confiança).';

drop trigger if exists workspace_findings_set_updated_at on core.workspace_findings;
create trigger workspace_findings_set_updated_at before update on core.workspace_findings
  for each row execute function core.set_updated_at();
drop trigger if exists workspace_findings_audit on core.workspace_findings;
create trigger workspace_findings_audit
  after insert or update or delete on core.workspace_findings
  for each row execute function core.audit_row_change();

-- Quem resolveu e quando: preenchidos pelo banco.
create or replace function core.stamp_finding_resolution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'open' then
      new.resolved_by := null;
      new.resolved_at := null;
    else
      new.resolved_by := (select auth.uid());
      new.resolved_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function core.stamp_finding_resolution() from public, anon, authenticated;

drop trigger if exists workspace_findings_stamp_resolution on core.workspace_findings;
create trigger workspace_findings_stamp_resolution
  before insert or update on core.workspace_findings
  for each row execute function core.stamp_finding_resolution();

alter table core.workspace_findings enable row level security;

drop policy if exists "workspace_findings_select_members" on core.workspace_findings;
create policy "workspace_findings_select_members" on core.workspace_findings
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "workspace_findings_insert_editors" on core.workspace_findings;
create policy "workspace_findings_insert_editors" on core.workspace_findings
  for insert to authenticated
  with check (
    core.has_role(org_id, 'editor')
    and exists (select 1 from core.edital_workspaces w where w.id = workspace_id and w.org_id = workspace_findings.org_id)
    and (item_id is null or exists (
      select 1 from core.edital_workspace_items i where i.id = item_id and i.workspace_id = workspace_findings.workspace_id))
  );
drop policy if exists "workspace_findings_update_editors" on core.workspace_findings;
create policy "workspace_findings_update_editors" on core.workspace_findings
  for update to authenticated
  using (core.has_role(org_id, 'editor'))
  with check (
    core.has_role(org_id, 'editor')
    and (item_id is null or exists (
      select 1 from core.edital_workspace_items i where i.id = item_id and i.workspace_id = workspace_findings.workspace_id))
  );
drop policy if exists "workspace_findings_delete_admins" on core.workspace_findings;
create policy "workspace_findings_delete_admins" on core.workspace_findings
  for delete to authenticated using (core.has_role(org_id, 'admin'));

grant select, delete on core.workspace_findings to authenticated;
grant insert (id, org_id, workspace_id, kind, dedupe_key, title, detail, severity, status, confidence, source_kind,
              evidence, points, item_id, created_via, run_id)
  on core.workspace_findings to authenticated;
grant update (title, detail, severity, status, confidence, source_kind, evidence, points, item_id, run_id, resolution)
  on core.workspace_findings to authenticated;
grant all on core.workspace_findings to service_role;

-- ---------------------------------------------------------------------
-- core.agent_actions — auditoria das ferramentas e propostas com confirmação
-- ---------------------------------------------------------------------
create table if not exists core.agent_actions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references core.organizations (id) on delete cascade,
  run_id        uuid not null references core.agent_runs (id) on delete cascade,
  workspace_id  uuid not null references core.edital_workspaces (id) on delete cascade,
  step          integer not null default 0 check (step >= 0),
  tool          text not null check (char_length(tool) between 1 and 80),
  kind          text not null check (kind in ('read', 'write', 'proposal')),
  status        text not null check (status in ('ok', 'error', 'rejected', 'pending_confirmation', 'approved', 'declined')),
  summary       text check (summary is null or char_length(summary) <= 1000),
  input         jsonb not null default '{}'::jsonb,
  before_data   jsonb,
  after_data    jsonb,
  target_table  text check (target_table is null or char_length(target_table) <= 80),
  target_id     text check (target_id is null or char_length(target_id) <= 80),
  evidence      jsonb,
  confidence    text check (confidence is null or confidence in ('confirmed', 'inferred', 'not_found', 'needs_human')),
  proposal      jsonb,
  error         text check (error is null or char_length(error) <= 2000),
  decided_by    uuid references core.profiles (id) on delete set null,
  decided_at    timestamptz,
  created_by    uuid references core.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);

create index if not exists agent_actions_run_idx on core.agent_actions (run_id, created_at);
create index if not exists agent_actions_pending_idx on core.agent_actions (workspace_id, status) where status = 'pending_confirmation';

comment on table core.agent_actions is 'Auditoria do Assistente LEP: cada ferramenta (antes/depois, evidência, erro) e propostas que exigem confirmação.';

-- Decisão humana sobre proposta: o banco registra quem decidiu e quando.
create or replace function core.stamp_agent_action_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'declined') then
    if old.status <> 'pending_confirmation' then
      raise exception 'só propostas pendentes podem ser aprovadas ou recusadas';
    end if;
    new.decided_by := (select auth.uid());
    new.decided_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function core.stamp_agent_action_decision() from public, anon, authenticated;

drop trigger if exists agent_actions_stamp_decision on core.agent_actions;
create trigger agent_actions_stamp_decision
  before update on core.agent_actions
  for each row execute function core.stamp_agent_action_decision();

alter table core.agent_actions enable row level security;

drop policy if exists "agent_actions_select_members" on core.agent_actions;
create policy "agent_actions_select_members" on core.agent_actions
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "agent_actions_insert_editors" on core.agent_actions;
create policy "agent_actions_insert_editors" on core.agent_actions
  for insert to authenticated
  with check (
    core.has_role(org_id, 'editor')
    and exists (
      select 1 from core.agent_runs r
      where r.id = run_id and r.org_id = agent_actions.org_id and r.workspace_id = agent_actions.workspace_id)
  );
drop policy if exists "agent_actions_update_editors" on core.agent_actions;
create policy "agent_actions_update_editors" on core.agent_actions
  for update to authenticated
  using (core.has_role(org_id, 'editor'))
  with check (core.has_role(org_id, 'editor'));

grant select on core.agent_actions to authenticated;
grant insert (id, org_id, run_id, workspace_id, step, tool, kind, status, summary, input, before_data, after_data,
              target_table, target_id, evidence, confidence, proposal, error)
  on core.agent_actions to authenticated;
-- Só a decisão é editável (auditoria imutável no resto).
grant update (status) on core.agent_actions to authenticated;
grant all on core.agent_actions to service_role;
