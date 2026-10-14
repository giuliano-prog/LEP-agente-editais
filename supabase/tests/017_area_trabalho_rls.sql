-- =====================================================================
-- Testes da Área de Trabalho do Edital (ADR-0026): acervo, área de trabalho e checklist.
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

-- Org A: ADM (a), Diretoria (e), Equipe (f), membro suspenso (s). Org B: ADM (b0).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'adm@teste.local'),
  ('00000000-0000-0000-0000-00000000000e', 'diretoria@teste.local'),
  ('00000000-0000-0000-0000-00000000000f', 'equipe@teste.local'),
  ('00000000-0000-0000-0000-000000000005', 'suspenso@teste.local'),
  ('00000000-0000-0000-0000-0000000000b0', 'adm-b@teste.local');
insert into core.organizations (id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', 'org-b-teste');
insert into core.memberships (org_id, user_id, role, status) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'admin', 'active'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e', 'editor', 'active'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'viewer', 'active'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', 'editor', 'suspended'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b0', 'admin', 'active');
insert into core.editais (id, org_id, title) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Edital A'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Edital A2'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'Edital B');
insert into core.projetos (id, org_id, title, format, stage) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Produção A', 'feature_film', 'development'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'Produção B', 'short_film', 'development');

-- Restrições de dados (como servidor) ---------------------------------------------------
select tests.throws(
  $$insert into core.org_documents (org_id, scope, title) values ('10000000-0000-0000-0000-00000000000a', 'production', 'Sem produção')$$,
  'documento de produção exige a produção vinculada');
select tests.throws(
  $$insert into core.org_documents (org_id, title, file_path) values ('10000000-0000-0000-0000-00000000000a', 'Fora da pasta', '10000000-0000-0000-0000-00000000000b/acervo/x.pdf')$$,
  'arquivo do acervo precisa ficar em <org_id>/acervo/');
select tests.throws(
  $$insert into core.org_documents (org_id, title, external_url) values ('10000000-0000-0000-0000-00000000000a', 'Link', 'javascript:alert(1)')$$,
  'link externo só http(s)');

-- Equipe (viewer): consulta, não altera ------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.throws(
  $$insert into core.edital_workspaces (org_id, edital_id) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1')$$,
  'Equipe não cria área de trabalho');
select tests.throws(
  $$insert into core.org_documents (org_id, title) values ('10000000-0000-0000-0000-00000000000a', 'Certidão')$$,
  'Equipe não cadastra documento no acervo');

-- Diretoria (editor): trabalha no edital --------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000e');
insert into core.edital_workspaces (id, org_id, edital_id, projeto_id, requested_amount)
values ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
        '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 500000);
select tests.ok(
  (select created_by = '00000000-0000-0000-0000-00000000000e' and status = 'preparing'
   from core.edital_workspaces where id = '40000000-0000-0000-0000-0000000000a1'),
  'Diretoria cria a área de trabalho (autoria e status inicial pelo banco)');
select tests.throws(
  $$insert into core.edital_workspaces (org_id, edital_id) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1')$$,
  'uma única área de trabalho por edital');
select tests.throws(
  $$insert into core.edital_workspaces (org_id, edital_id, projeto_id) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-0000000000b1')$$,
  'não vincula produção de outra organização');
select tests.throws(
  $$insert into core.edital_workspaces (org_id, edital_id) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000b1')$$,
  'não cria área de trabalho para edital de outra organização');
select tests.throws(
  $$update core.edital_workspaces set status = 'talvez'$$,
  'status só aceita os valores previstos');
select tests.throws(
  $$update core.edital_workspaces set requested_amount = -1$$,
  'valores não podem ser negativos');

insert into core.org_documents (id, org_id, category, title, valid_until)
values ('50000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'fiscal', 'CND Federal', '2026-12-31');
insert into core.org_documents (org_id, scope, projeto_id, category, title)
values ('10000000-0000-0000-0000-00000000000a', 'production', '30000000-0000-0000-0000-0000000000a1', 'rights', 'Cessão de direitos do roteiro');

insert into core.edital_workspace_items (id, org_id, workspace_id, category, title, origin, source_key, char_limit, responsible_id)
values ('60000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1',
        'text', 'Sinopse', 'edital', 'text:sinopse', 1500, '00000000-0000-0000-0000-00000000000f');
select tests.ok(
  (select updated_by = '00000000-0000-0000-0000-00000000000e' from core.edital_workspace_items where id = '60000000-0000-0000-0000-0000000000a1'),
  'o banco registra quem alterou o item');
select tests.throws(
  $$insert into core.edital_workspace_items (org_id, workspace_id, title, source_key) values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'Duplicado', 'text:sinopse')$$,
  'itens gerados do edital não duplicam (source_key)');
select tests.throws(
  $$update core.edital_workspace_items set responsible_id = '00000000-0000-0000-0000-0000000000b0' where id = '60000000-0000-0000-0000-0000000000a1'$$,
  'responsável precisa ser membro da organização');
select tests.throws(
  $$update core.edital_workspace_items set responsible_id = '00000000-0000-0000-0000-000000000005' where id = '60000000-0000-0000-0000-0000000000a1'$$,
  'responsável suspenso não pode ser atribuído');
select tests.ok(
  tests.affected($$update core.edital_workspace_items set status = 'done', content = 'Texto', org_document_id = '50000000-0000-0000-0000-0000000000a1' where id = '60000000-0000-0000-0000-0000000000a1'$$) = 1,
  'Diretoria atualiza status, texto e documento do acervo');
select tests.throws(
  $$update core.edital_workspace_items set status = 'feito'$$,
  'status do item só aceita os valores previstos');
select tests.throws(
  $$update core.edital_workspace_items set workspace_id = '40000000-0000-0000-0000-0000000000a1'$$,
  'item não muda de área de trabalho');
select tests.ok(
  tests.affected($$delete from core.edital_workspaces where id = '40000000-0000-0000-0000-0000000000a1'$$) = 0,
  'Diretoria não exclui a área de trabalho inteira');

-- Equipe vê o trabalho, mas não altera ----------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok((select count(*) = 1 from core.edital_workspaces), 'Equipe vê a área de trabalho');
select tests.ok((select count(*) = 1 from core.edital_workspace_items), 'Equipe vê o checklist');
select tests.ok((select count(*) = 2 from core.org_documents), 'Equipe vê o acervo');
select tests.ok(
  tests.affected($$update core.edital_workspace_items set status = 'pending'$$) = 0,
  'Equipe não altera o checklist');

-- Outra organização: não vê nem escreve ------------------------------------------------------
select tests.login('00000000-0000-0000-0000-0000000000b0');
select tests.ok((select count(*) = 0 from core.edital_workspaces), 'outra organização não vê a área de trabalho');
select tests.ok((select count(*) = 0 from core.edital_workspace_items), 'outra organização não vê o checklist');
select tests.ok((select count(*) = 0 from core.org_documents), 'outra organização não vê o acervo');
select tests.throws(
  $$insert into core.edital_workspace_items (org_id, workspace_id, title) values ('10000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-0000000000a1', 'Invasão')$$,
  'não adiciona item em área de trabalho de outra organização');
select tests.throws(
  $$insert into core.edital_workspace_items (org_id, workspace_id, title) values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'Invasão')$$,
  'não escreve na organização alheia');

-- ADM: exclui a área de trabalho (itens vão junto) ------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.ok(
  tests.affected($$delete from core.edital_workspaces where id = '40000000-0000-0000-0000-0000000000a1'$$) = 1,
  'ADM exclui a área de trabalho');
select tests.ok((select count(*) = 0 from core.edital_workspace_items), 'itens excluídos junto (cascade)');

reset role;
select tests.ok(
  (select count(*) >= 3 from core.audit_log where table_name in ('edital_workspaces', 'edital_workspace_items', 'org_documents')),
  'área de trabalho e acervo ficam na auditoria');

\echo 'Todos os testes da Área de Trabalho passaram.'

rollback;
