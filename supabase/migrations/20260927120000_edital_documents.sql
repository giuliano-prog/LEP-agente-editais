-- =====================================================================
-- Etapa 2 — Cadastro de editais por URL/PDF
--
-- • Bucket privado `edital-documents` no Supabase Storage (PDF e HTML, até 25 MB).
--   Caminho dos arquivos: <org_id>/<pasta>/<arquivo>. A primeira pasta define a
--   organização dona do arquivo e é usada pelas políticas de acesso.
-- • core.edital_documents: cada documento de um edital (edital principal, anexos,
--   retificações...), com hash SHA-256 para detectar duplicidade e, no futuro,
--   alterações entre versões.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitário: converte texto em uuid sem gerar erro (null se inválido)
-- ---------------------------------------------------------------------
create function core.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function core.try_uuid(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('edital-documents', 'edital-documents', false, 26214400, array['application/pdf', 'text/html'])
on conflict (id) do nothing;

create policy "edital_documents_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'edital-documents'
    and core.has_role(core.try_uuid((storage.foldername(name))[1]), 'viewer')
  );

create policy "edital_documents_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'edital-documents'
    and core.has_role(core.try_uuid((storage.foldername(name))[1]), 'editor')
  );

create policy "edital_documents_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'edital-documents'
    and core.has_role(core.try_uuid((storage.foldername(name))[1]), 'editor')
  );

-- ---------------------------------------------------------------------
-- core.edital_documents
-- edital_id usa o mesmo tipo de core.editais.id (uuid localmente; pode ser
-- bigint na tabela criada originalmente no painel do Supabase remoto).
-- ---------------------------------------------------------------------
do $$
declare
  v_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_id_type
  from pg_attribute a
  where a.attrelid = 'core.editais'::regclass and a.attname = 'id' and not a.attisdropped;

  execute format($ddl$
    create table core.edital_documents (
      id            uuid primary key default gen_random_uuid(),
      org_id        uuid not null references core.organizations (id) on delete cascade,
      edital_id     %s not null references core.editais (id) on delete cascade,
      kind          text not null default 'main'
                    check (kind in ('main', 'annex', 'rectification', 'faq', 'result', 'other')),
      source        text not null check (source in ('url', 'upload')),
      source_url    text,
      final_url     text,
      storage_path  text not null unique check (split_part(storage_path, '/', 1) = org_id::text),
      file_name     text,
      mime_type     text not null check (mime_type in ('application/pdf', 'text/html')),
      size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
      sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
      http_status   integer,
      metadata      jsonb not null default '{}'::jsonb,
      created_by    uuid default auth.uid() references core.profiles (id) on delete set null,
      created_at    timestamptz not null default now(),
      updated_at    timestamptz not null default now()
    )
  $ddl$, v_id_type);
end;
$$;

create index edital_documents_edital_idx on core.edital_documents (edital_id, created_at);
create index edital_documents_org_sha_idx on core.edital_documents (org_id, sha256);

comment on table core.edital_documents is 'Documentos de cada edital (cópia original guardada no Storage). Nunca alterar o arquivo: nova versão = novo documento.';
comment on column core.edital_documents.kind is 'main | annex | rectification | faq | result | other';
comment on column core.edital_documents.metadata is 'Metadados extraídos sem IA: page_title, pdf_links (links de PDF encontrados na página).';

create trigger edital_documents_set_updated_at before update on core.edital_documents
  for each row execute function core.set_updated_at();
create trigger edital_documents_audit
  after insert or update or delete on core.edital_documents
  for each row execute function core.audit_row_change();

alter table core.edital_documents enable row level security;

create policy "edital_documents_select_members" on core.edital_documents
  for select to authenticated
  using (core.has_role(org_id, 'viewer'));

-- O edital precisa ser da mesma organização do documento.
create policy "edital_documents_insert_editors" on core.edital_documents
  for insert to authenticated
  with check (
    core.has_role(org_id, 'editor')
    and exists (select 1 from core.editais e where e.id = edital_id and e.org_id = edital_documents.org_id)
  );

create policy "edital_documents_update_editors" on core.edital_documents
  for update to authenticated
  using (core.has_role(org_id, 'editor'))
  with check (core.has_role(org_id, 'editor'));

create policy "edital_documents_delete_admins" on core.edital_documents
  for delete to authenticated
  using (core.has_role(org_id, 'admin'));

grant select, delete on core.edital_documents to authenticated;
grant insert (org_id, edital_id, kind, source, source_url, final_url, storage_path, file_name,
              mime_type, size_bytes, sha256, http_status, metadata)
  on core.edital_documents to authenticated;
grant update (kind) on core.edital_documents to authenticated;
grant all on core.edital_documents to service_role;

-- ---------------------------------------------------------------------
-- Criação atômica: edital + primeiro documento na mesma transação.
-- SECURITY INVOKER: roda com as permissões (e o RLS) de quem chama.
-- Retorna o id do edital como texto (o tipo de core.editais.id pode variar).
-- ---------------------------------------------------------------------
create function core.create_edital_with_document(
  p_org_id        uuid,
  p_title         text,
  p_official_url  text,
  p_kind          text,
  p_source        text,
  p_source_url    text,
  p_final_url     text,
  p_storage_path  text,
  p_file_name     text,
  p_mime_type     text,
  p_size_bytes    bigint,
  p_sha256        text,
  p_http_status   integer,
  p_metadata      jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_edital_id text;
begin
  insert into core.editais (org_id, title, official_url)
  values (p_org_id, p_title, p_official_url)
  returning id::text into v_edital_id;

  insert into core.edital_documents
    (org_id, edital_id, kind, source, source_url, final_url, storage_path, file_name,
     mime_type, size_bytes, sha256, http_status, metadata)
  select p_org_id, e.id, p_kind, p_source, p_source_url, p_final_url, p_storage_path, p_file_name,
         p_mime_type, p_size_bytes, p_sha256, p_http_status, coalesce(p_metadata, '{}'::jsonb)
  from core.editais e
  where e.id::text = v_edital_id;

  return v_edital_id;
end;
$$;

revoke execute on function core.create_edital_with_document(uuid, text, text, text, text, text, text, text, text, text, bigint, text, integer, jsonb) from public, anon;
grant execute on function core.create_edital_with_document(uuid, text, text, text, text, text, text, text, text, text, bigint, text, integer, jsonb) to authenticated, service_role;
