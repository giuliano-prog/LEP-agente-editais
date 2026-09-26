-- =====================================================================
-- Testes de permissões de core.edital_documents e do Storage (bucket edital-documents).
-- Tudo roda em uma transação desfeita no final (ROLLBACK).
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

begin;

create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create function tests.ok(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'FALHOU: %', p_message;
  end if;
  raise notice 'ok - %', p_message;
end;
$$;

create function tests.throws(p_sql text, p_message text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok - % [%]', p_message, sqlerrm;
    return;
  end;
  raise exception 'FALHOU: % (era esperado um erro)', p_message;
end;
$$;

create function tests.affected(p_sql text) returns integer language plpgsql as $$
declare
  v_count integer;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on all functions in schema tests to authenticated, anon;

-- Cenário: org A (admin, editor, viewer) e org B (admin).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@teste.local'),
  ('00000000-0000-0000-0000-00000000000e', 'editor@teste.local'),
  ('00000000-0000-0000-0000-00000000000f', 'viewer@teste.local'),
  ('00000000-0000-0000-0000-0000000000b0', 'outsider@teste.local');

insert into core.organizations (id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', 'org-b-teste');

insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e', 'editor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'viewer'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b0', 'admin');

insert into core.editais (id, org_id, title) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Edital A'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Edital B');

insert into storage.objects (bucket_id, name) values
  ('edital-documents', '10000000-0000-0000-0000-00000000000a/uploads/a.pdf'),
  ('edital-documents', '10000000-0000-0000-0000-00000000000b/uploads/b.pdf'),
  ('edital-documents', 'caminho-sem-org/x.pdf');

select tests.ok(
  (select public = false and 'application/pdf' = any(allowed_mime_types) from storage.buckets where id = 'edital-documents'),
  'bucket edital-documents é privado e aceita PDF');

-- viewer --------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000f');

select tests.ok((select count(*) = 1 from storage.objects where bucket_id = 'edital-documents'),
  'viewer lê somente arquivos da própria org (caminho inválido é ignorado, sem erro)');
select tests.throws(
  $$insert into storage.objects (bucket_id, name) values ('edital-documents', '10000000-0000-0000-0000-00000000000a/uploads/v.pdf')$$,
  'viewer não envia arquivos');
select tests.throws(
  $$insert into core.edital_documents (org_id, edital_id, source, storage_path, mime_type, sha256)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'upload',
            '10000000-0000-0000-0000-00000000000a/uploads/a.pdf', 'application/pdf', repeat('a', 64))$$,
  'viewer não registra documentos');

-- editor --------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000e');

select tests.ok(
  tests.affected($$insert into storage.objects (bucket_id, name) values ('edital-documents', '10000000-0000-0000-0000-00000000000a/uploads/e.pdf')$$) = 1,
  'editor envia arquivo na pasta da própria org');
select tests.throws(
  $$insert into storage.objects (bucket_id, name) values ('edital-documents', '10000000-0000-0000-0000-00000000000b/uploads/e.pdf')$$,
  'editor não envia arquivo na pasta de outra org');
select tests.throws(
  $$insert into storage.objects (bucket_id, name) values ('edital-documents', 'sem-org/e.pdf')$$,
  'editor não envia arquivo fora da pasta de uma org');
select tests.throws(
  $$insert into core.edital_documents (org_id, edital_id, kind, source, storage_path, mime_type, sha256, created_by)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'main', 'upload',
            '10000000-0000-0000-0000-00000000000a/uploads/e.pdf', 'application/pdf', repeat('a', 64), null)$$,
  'created_by não pode ser informado pelo usuário');
select tests.ok(
  tests.affected($$insert into core.edital_documents (org_id, edital_id, kind, source, storage_path, mime_type, sha256)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'main', 'upload',
            '10000000-0000-0000-0000-00000000000a/uploads/e.pdf', 'application/pdf', repeat('a', 64))$$) = 1,
  'editor registra documento em edital da própria org');
select tests.ok(
  (select created_by = '00000000-0000-0000-0000-00000000000e' from core.edital_documents where storage_path like '%/e.pdf'),
  'autor do documento é registrado automaticamente');
select tests.throws(
  $$insert into core.edital_documents (org_id, edital_id, source, storage_path, mime_type, sha256)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000b', 'upload',
            '10000000-0000-0000-0000-00000000000a/uploads/x.pdf', 'application/pdf', repeat('b', 64))$$,
  'documento não pode apontar para edital de outra org');
select tests.throws(
  $$insert into core.edital_documents (org_id, edital_id, source, storage_path, mime_type, sha256)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'upload',
            '10000000-0000-0000-0000-00000000000b/uploads/b.pdf', 'application/pdf', repeat('c', 64))$$,
  'caminho do arquivo precisa estar na pasta da mesma org');
select tests.throws(
  $$insert into core.edital_documents (org_id, edital_id, source, storage_path, mime_type, sha256)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'upload',
            '10000000-0000-0000-0000-00000000000a/uploads/z.exe', 'application/x-msdownload', repeat('d', 64))$$,
  'somente PDF e HTML são aceitos');
select tests.throws(
  $$insert into core.edital_documents (org_id, edital_id, source, storage_path, mime_type, sha256)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'upload',
            '10000000-0000-0000-0000-00000000000a/uploads/y.pdf', 'application/pdf', 'nao-e-hash')$$,
  'hash SHA-256 é validado');
select tests.throws(
  $$update core.edital_documents set sha256 = repeat('f', 64) where storage_path like '%/e.pdf'$$,
  'hash do documento não pode ser alterado (arquivo original é imutável)');
select tests.ok(
  tests.affected($$update core.edital_documents set kind = 'annex' where storage_path like '%/e.pdf'$$) = 1,
  'editor reclassifica o tipo do documento');
select tests.ok(
  tests.affected($$delete from core.edital_documents where storage_path like '%/e.pdf'$$) = 0,
  'editor não exclui documentos (somente admin)');

select tests.ok(
  (select core.create_edital_with_document(
     '10000000-0000-0000-0000-00000000000a', 'Edital via link', 'https://exemplo.gov.br/edital',
     'main', 'url', 'https://exemplo.gov.br/edital', 'https://exemplo.gov.br/edital',
     '10000000-0000-0000-0000-00000000000a/captures/c1.html', null, 'text/html', 1234,
     repeat('e', 64), 200, '{"page_title": "Edital"}'::jsonb) is not null),
  'editor cria edital + documento em uma única operação');
select tests.ok(
  (select count(*) = 1 from core.edital_documents d join core.editais e on e.id = d.edital_id
   where e.title = 'Edital via link'),
  'edital e documento criados juntos') ;

-- viewer não consegue criar pela função (RLS continua valendo)
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.throws(
  $$select core.create_edital_with_document('10000000-0000-0000-0000-00000000000a', 'Viewer', null, 'main', 'upload', null, null,
     '10000000-0000-0000-0000-00000000000a/uploads/v2.pdf', 'v.pdf', 'application/pdf', 1, repeat('9', 64), null, null)$$,
  'viewer não cria edital pela função');

-- falha no documento desfaz também o edital (transação única)
select tests.login('00000000-0000-0000-0000-00000000000e');
select tests.throws(
  $$select core.create_edital_with_document('10000000-0000-0000-0000-00000000000a', 'Edital com documento inválido', null, 'main', 'upload', null, null,
     '10000000-0000-0000-0000-00000000000a/uploads/z.pdf', 'z.pdf', 'application/zip', 1, repeat('8', 64), null, null)$$,
  'documento inválido gera erro');
select tests.ok(
  (select count(*) = 0 from core.editais where title = 'Edital com documento inválido'),
  'edital não fica órfão quando o documento falha');

-- outra org -----------------------------------------------------------
select tests.login('00000000-0000-0000-0000-0000000000b0');
select tests.ok((select count(*) = 0 from core.edital_documents), 'org B não vê documentos da org A');

reset role;

\echo 'Todos os testes de documentos e Storage passaram.'

rollback;
