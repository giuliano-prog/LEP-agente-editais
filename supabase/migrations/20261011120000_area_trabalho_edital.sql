-- =====================================================================
-- Área de Trabalho do Edital (ADR-0026): preparar a inscrição de uma produção.
--
-- • core.org_documents: acervo de documentos da PRODUTORA (LEP) e das PRODUÇÕES
--   (certidões, contrato social, cessões, portfólio...), com validade. Arquivo
--   opcional no bucket privado `edital-documents` em <org_id>/acervo/... (mesmas
--   políticas de Storage já existentes) ou link externo.
-- • core.edital_workspaces: uma área de trabalho por edital — produção vinculada,
--   valores (solicitado, orçamento total, contrapartida), status e as regras do
--   edital extraídas sem IA (limites de texto, critérios, direitos...), em jsonb.
-- • core.edital_workspace_items: checklist da inscrição (documentos, textos,
--   orçamento, equipe, direitos, anexos...), com status, responsável (membro da
--   organização), prazo interno, limites e o rascunho dos textos.
--
-- Permissões: Equipe (viewer) consulta; Diretoria (editor) e ADM trabalham;
-- excluir a área de trabalho inteira é só do ADM. Tudo filtrado por org_id (RLS).
-- edital_id usa o tipo de core.editais.id (uuid localmente; pode ser bigint remoto).
-- Idempotente (ADR-0014): o CI aplica 2x e sobre banco parcial.
-- =====================================================================

-- ---------------------------------------------------------------------
-- core.org_documents — acervo da produtora e das produções
-- ---------------------------------------------------------------------
create table if not exists core.org_documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references core.organizations (id) on delete cascade,
  projeto_id   uuid references core.projetos (id) on delete cascade,
  scope        text not null default 'company' check (scope in ('company', 'production')),
  category     text not null default 'other'
               check (category in ('legal', 'fiscal', 'labor', 'registration', 'rights', 'portfolio', 'technical', 'other')),
  title        text not null check (char_length(title) between 2 and 200),
  file_path    text,
  file_name    text check (file_name is null or char_length(file_name) <= 255),
  mime_type    text,
  size_bytes   bigint check (size_bytes is null or size_bytes between 0 and 26214400),
  sha256       text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  external_url text check (external_url is null or external_url ~* '^https?://'),
  valid_until  date,
  notes        text check (notes is null or char_length(notes) <= 2000),
  created_by   uuid references core.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Regras de coerência (recriadas para valer também em banco parcial).
alter table core.org_documents drop constraint if exists org_documents_scope_check2;
alter table core.org_documents
  add constraint org_documents_scope_check2
  check ((scope = 'production') = (projeto_id is not null));
alter table core.org_documents drop constraint if exists org_documents_file_path_check;
alter table core.org_documents
  add constraint org_documents_file_path_check
  check (file_path is null or file_path like org_id::text || '/acervo/%');

create index if not exists org_documents_org_idx on core.org_documents (org_id, scope, category);
create index if not exists org_documents_projeto_idx on core.org_documents (projeto_id) where projeto_id is not null;

comment on table core.org_documents is 'Acervo de documentos da LEP (produtora) e das produções, reutilizado nas inscrições (dados sigilosos).';
comment on column core.org_documents.file_path is 'Arquivo no bucket privado edital-documents: <org_id>/acervo/<arquivo>.';
comment on column core.org_documents.valid_until is 'Validade (certidões etc.): a Área de Trabalho alerta se vence antes do prazo do edital.';

drop trigger if exists org_documents_set_updated_at on core.org_documents;
create trigger org_documents_set_updated_at before update on core.org_documents
  for each row execute function core.set_updated_at();
drop trigger if exists org_documents_audit on core.org_documents;
create trigger org_documents_audit
  after insert or update or delete on core.org_documents
  for each row execute function core.audit_row_change();

alter table core.org_documents enable row level security;

drop policy if exists "org_documents_select_members" on core.org_documents;
create policy "org_documents_select_members" on core.org_documents
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "org_documents_insert_editors" on core.org_documents;
create policy "org_documents_insert_editors" on core.org_documents
  for insert to authenticated
  with check (
    core.has_role(org_id, 'editor')
    and (projeto_id is null
         or exists (select 1 from core.projetos p where p.id = projeto_id and p.org_id = org_documents.org_id))
  );
drop policy if exists "org_documents_update_editors" on core.org_documents;
create policy "org_documents_update_editors" on core.org_documents
  for update to authenticated
  using (core.has_role(org_id, 'editor'))
  with check (
    core.has_role(org_id, 'editor')
    and (projeto_id is null
         or exists (select 1 from core.projetos p where p.id = projeto_id and p.org_id = org_documents.org_id))
  );
drop policy if exists "org_documents_delete_editors" on core.org_documents;
create policy "org_documents_delete_editors" on core.org_documents
  for delete to authenticated using (core.has_role(org_id, 'editor'));

grant select, delete on core.org_documents to authenticated;
grant insert (id, org_id, projeto_id, scope, category, title, file_path, file_name, mime_type, size_bytes, sha256,
              external_url, valid_until, notes)
  on core.org_documents to authenticated;
grant update (projeto_id, scope, category, title, external_url, valid_until, notes)
  on core.org_documents to authenticated;
grant all on core.org_documents to service_role;

-- ---------------------------------------------------------------------
-- core.edital_workspaces — uma área de trabalho por edital
-- ---------------------------------------------------------------------
do $$
declare
  v_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_id_type
  from pg_attribute a
  where a.attrelid = 'core.editais'::regclass and a.attname = 'id' and not a.attisdropped;

  execute format($ddl$
    create table if not exists core.edital_workspaces (
      id                  uuid primary key default gen_random_uuid(),
      org_id              uuid not null references core.organizations (id) on delete cascade,
      edital_id           %s not null references core.editais (id) on delete cascade,
      projeto_id          uuid references core.projetos (id) on delete set null,
      status              text not null default 'preparing'
                          check (status in ('preparing', 'ready', 'submitted', 'archived')),
      requested_amount    numeric(14, 2) check (requested_amount is null or requested_amount >= 0),
      total_budget        numeric(14, 2) check (total_budget is null or total_budget >= 0),
      counterpart_amount  numeric(14, 2) check (counterpart_amount is null or counterpart_amount >= 0),
      notes               text check (notes is null or char_length(notes) <= 5000),
      rules               jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object'),
      rules_source        text check (rules_source is null or rules_source in ('pdf', 'fields')),
      rules_extracted_at  timestamptz,
      created_by          uuid references core.profiles (id) on delete set null default auth.uid(),
      created_at          timestamptz not null default now(),
      updated_at          timestamptz not null default now()
    )
  $ddl$, v_id_type);
end;
$$;

create unique index if not exists edital_workspaces_edital_key on core.edital_workspaces (edital_id);
create index if not exists edital_workspaces_org_idx on core.edital_workspaces (org_id, status);

comment on table core.edital_workspaces is 'Área de Trabalho do Edital: preparação da inscrição de uma produção da LEP (dados sigilosos).';
comment on column core.edital_workspaces.rules is 'Regras extraídas sem IA, com trecho: {textLimits, criteria, bonus, rights, documents, team, budgetRules}.';

drop trigger if exists edital_workspaces_set_updated_at on core.edital_workspaces;
create trigger edital_workspaces_set_updated_at before update on core.edital_workspaces
  for each row execute function core.set_updated_at();
drop trigger if exists edital_workspaces_audit on core.edital_workspaces;
create trigger edital_workspaces_audit
  after insert or update or delete on core.edital_workspaces
  for each row execute function core.audit_row_change();

alter table core.edital_workspaces enable row level security;

drop policy if exists "edital_workspaces_select_members" on core.edital_workspaces;
create policy "edital_workspaces_select_members" on core.edital_workspaces
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "edital_workspaces_insert_editors" on core.edital_workspaces;
create policy "edital_workspaces_insert_editors" on core.edital_workspaces
  for insert to authenticated
  with check (
    core.has_role(org_id, 'editor')
    and exists (select 1 from core.editais e where e.id = edital_id and e.org_id = edital_workspaces.org_id)
    and (projeto_id is null
         or exists (select 1 from core.projetos p where p.id = projeto_id and p.org_id = edital_workspaces.org_id))
  );
drop policy if exists "edital_workspaces_update_editors" on core.edital_workspaces;
create policy "edital_workspaces_update_editors" on core.edital_workspaces
  for update to authenticated
  using (core.has_role(org_id, 'editor'))
  with check (
    core.has_role(org_id, 'editor')
    and (projeto_id is null
         or exists (select 1 from core.projetos p where p.id = projeto_id and p.org_id = edital_workspaces.org_id))
  );
drop policy if exists "edital_workspaces_delete_admins" on core.edital_workspaces;
create policy "edital_workspaces_delete_admins" on core.edital_workspaces
  for delete to authenticated using (core.has_role(org_id, 'admin'));

grant select, delete on core.edital_workspaces to authenticated;
grant insert (id, org_id, edital_id, projeto_id, status, requested_amount, total_budget, counterpart_amount, notes,
              rules, rules_source, rules_extracted_at)
  on core.edital_workspaces to authenticated;
grant update (projeto_id, status, requested_amount, total_budget, counterpart_amount, notes,
              rules, rules_source, rules_extracted_at)
  on core.edital_workspaces to authenticated;
grant all on core.edital_workspaces to service_role;

-- ---------------------------------------------------------------------
-- core.edital_workspace_items — checklist da inscrição
-- ---------------------------------------------------------------------
create table if not exists core.edital_workspace_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references core.organizations (id) on delete cascade,
  workspace_id     uuid not null references core.edital_workspaces (id) on delete cascade,
  category         text not null default 'other'
                   check (category in ('document', 'text', 'budget', 'team', 'rights', 'eligibility', 'annex', 'other')),
  title            text not null check (char_length(title) between 2 and 300),
  description      text check (description is null or char_length(description) <= 2000),
  requirement      text not null default 'mandatory' check (requirement in ('mandatory', 'optional', 'bonus')),
  origin           text not null default 'manual' check (origin in ('edital', 'manual')),
  source_key       text check (source_key is null or char_length(source_key) <= 120),
  evidence         text check (evidence is null or char_length(evidence) <= 1000),
  status           text not null default 'pending'
                   check (status in ('pending', 'in_progress', 'done', 'not_applicable')),
  responsible_id   uuid references core.profiles (id) on delete set null,
  due_date         date,
  char_limit       integer check (char_limit is null or char_limit > 0),
  word_limit       integer check (word_limit is null or word_limit > 0),
  page_limit       integer check (page_limit is null or page_limit > 0),
  content          text check (content is null or char_length(content) <= 50000),
  org_document_id  uuid references core.org_documents (id) on delete set null,
  notes            text check (notes is null or char_length(notes) <= 2000),
  position         integer not null default 0,
  updated_by       uuid references core.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists edital_workspace_items_source_key
  on core.edital_workspace_items (workspace_id, source_key) where source_key is not null;
create index if not exists edital_workspace_items_workspace_idx
  on core.edital_workspace_items (workspace_id, category, position);

comment on table core.edital_workspace_items is 'Itens do checklist da inscrição (documentos, textos, orçamento, equipe, direitos...).';
comment on column core.edital_workspace_items.source_key is 'Chave estável dos itens gerados a partir do edital (regerar não duplica nem apaga o trabalho feito).';
comment on column core.edital_workspace_items.content is 'Rascunho do texto exigido (contagem de caracteres/palavras/páginas na Área de Trabalho).';

-- Quem alterou por último: preenchido pelo banco.
create or replace function core.stamp_workspace_item_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

revoke execute on function core.stamp_workspace_item_author() from public, anon, authenticated;

drop trigger if exists edital_workspace_items_stamp_author on core.edital_workspace_items;
create trigger edital_workspace_items_stamp_author
  before insert or update on core.edital_workspace_items
  for each row execute function core.stamp_workspace_item_author();
drop trigger if exists edital_workspace_items_set_updated_at on core.edital_workspace_items;
create trigger edital_workspace_items_set_updated_at before update on core.edital_workspace_items
  for each row execute function core.set_updated_at();
drop trigger if exists edital_workspace_items_audit on core.edital_workspace_items;
create trigger edital_workspace_items_audit
  after insert or update or delete on core.edital_workspace_items
  for each row execute function core.audit_row_change();

alter table core.edital_workspace_items enable row level security;

-- Coerência entre organizações: área de trabalho, responsável (membro ativo) e
-- documento do acervo precisam ser da MESMA organização do item.
create or replace function core.workspace_item_refs_ok(
  p_org_id uuid, p_workspace_id uuid, p_responsible_id uuid, p_org_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from core.edital_workspaces w where w.id = p_workspace_id and w.org_id = p_org_id)
    and (p_responsible_id is null or exists (
      select 1 from core.memberships m
      where m.user_id = p_responsible_id and m.org_id = p_org_id and m.status = 'active'))
    and (p_org_document_id is null or exists (
      select 1 from core.org_documents d where d.id = p_org_document_id and d.org_id = p_org_id));
$$;

revoke execute on function core.workspace_item_refs_ok(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function core.workspace_item_refs_ok(uuid, uuid, uuid, uuid) to authenticated, service_role;

drop policy if exists "edital_workspace_items_select_members" on core.edital_workspace_items;
create policy "edital_workspace_items_select_members" on core.edital_workspace_items
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "edital_workspace_items_insert_editors" on core.edital_workspace_items;
create policy "edital_workspace_items_insert_editors" on core.edital_workspace_items
  for insert to authenticated
  with check (
    core.has_role(org_id, 'editor')
    and core.workspace_item_refs_ok(org_id, workspace_id, responsible_id, org_document_id)
  );
drop policy if exists "edital_workspace_items_update_editors" on core.edital_workspace_items;
create policy "edital_workspace_items_update_editors" on core.edital_workspace_items
  for update to authenticated
  using (core.has_role(org_id, 'editor'))
  with check (
    core.has_role(org_id, 'editor')
    and core.workspace_item_refs_ok(org_id, workspace_id, responsible_id, org_document_id)
  );
drop policy if exists "edital_workspace_items_delete_editors" on core.edital_workspace_items;
create policy "edital_workspace_items_delete_editors" on core.edital_workspace_items
  for delete to authenticated using (core.has_role(org_id, 'editor'));

grant select, delete on core.edital_workspace_items to authenticated;
grant insert (id, org_id, workspace_id, category, title, description, requirement, origin, source_key, evidence, status,
              responsible_id, due_date, char_limit, word_limit, page_limit, content, org_document_id, notes, position)
  on core.edital_workspace_items to authenticated;
grant update (category, title, description, requirement, evidence, status, responsible_id, due_date, char_limit,
              word_limit, page_limit, content, org_document_id, notes, position)
  on core.edital_workspace_items to authenticated;
grant all on core.edital_workspace_items to service_role;
