-- =====================================================================
-- Detecção de alterações e retificações (etapa 10 das melhorias).
--
-- • core.edital_changes: cada alteração detectada (campos com valor novo e/ou
--   retificações/erratas novas), com antes → depois e o trecho de evidência.
--   Status: pending (aguarda a equipe) | applied (valores novos aplicados) |
--   dismissed (ignorada). Nada é sobrescrito automaticamente.
-- • core.editais.last_checked_at / content_hash: última verificação e hash do
--   TEXTO da página (mudanças só de layout não geram alerta).
-- edital_id usa o tipo de core.editais.id (uuid localmente; pode ser bigint remoto).
-- Idempotente (ADR-0014).
-- =====================================================================

alter table core.editais
  add column if not exists last_checked_at  timestamptz,
  add column if not exists content_hash     text;

alter table core.editais drop constraint if exists editais_content_hash_check;
alter table core.editais
  add constraint editais_content_hash_check check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$');

comment on column core.editais.last_checked_at is 'Última verificação de alterações (varredura ou botão “Verificar alterações”).';
comment on column core.editais.content_hash is 'SHA-256 do texto da página oficial na última verificação.';

do $$
declare
  v_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_id_type
  from pg_attribute a
  where a.attrelid = 'core.editais'::regclass and a.attname = 'id' and not a.attisdropped;

  execute format($ddl$
    create table if not exists core.edital_changes (
      id           uuid primary key default gen_random_uuid(),
      org_id       uuid not null references core.organizations (id) on delete cascade,
      edital_id    %s not null references core.editais (id) on delete cascade,
      kind         text not null check (kind in ('fields_changed', 'rectification')),
      summary      text not null check (char_length(summary) <= 500),
      changes      jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array'),
      document_ids uuid[] not null default '{}',
      status       text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
      detected_at  timestamptz not null default now(),
      resolved_by  uuid references core.profiles (id) on delete set null,
      resolved_at  timestamptz
    )
  $ddl$, v_id_type);
end;
$$;

create index if not exists edital_changes_edital_idx on core.edital_changes (edital_id, detected_at desc);
create index if not exists edital_changes_org_pending_idx on core.edital_changes (org_id, status);

comment on table core.edital_changes is 'Alterações e retificações detectadas nos editais (proposta para a equipe; nunca aplicadas sozinhas).';
comment on column core.edital_changes.changes is '[{field, label, before, after, snippet, source}]';

-- Quem resolve e quando: preenchidos pelo banco.
create or replace function core.stamp_edital_change_resolution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'pending' then
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

revoke execute on function core.stamp_edital_change_resolution() from public, anon, authenticated;

drop trigger if exists edital_changes_stamp_resolution on core.edital_changes;
create trigger edital_changes_stamp_resolution
  before update on core.edital_changes
  for each row execute function core.stamp_edital_change_resolution();

drop trigger if exists edital_changes_audit on core.edital_changes;
create trigger edital_changes_audit
  after insert or update or delete on core.edital_changes
  for each row execute function core.audit_row_change();

alter table core.edital_changes enable row level security;

drop policy if exists "edital_changes_select_members" on core.edital_changes;
create policy "edital_changes_select_members" on core.edital_changes
  for select to authenticated using (core.has_role(org_id, 'viewer'));
-- "Verificar alterações" pela tela roda com a sessão da Diretoria/Admin.
drop policy if exists "edital_changes_insert_editors" on core.edital_changes;
create policy "edital_changes_insert_editors" on core.edital_changes
  for insert to authenticated
  with check (
    core.has_role(org_id, 'editor')
    and exists (select 1 from core.editais e where e.id = edital_id and e.org_id = edital_changes.org_id)
  );
drop policy if exists "edital_changes_update_editors" on core.edital_changes;
create policy "edital_changes_update_editors" on core.edital_changes
  for update to authenticated
  using (core.has_role(org_id, 'editor'))
  with check (core.has_role(org_id, 'editor'));

grant select on core.edital_changes to authenticated;
grant insert (org_id, edital_id, kind, summary, changes, document_ids) on core.edital_changes to authenticated;
grant update (status) on core.edital_changes to authenticated;
grant all on core.edital_changes to service_role;
