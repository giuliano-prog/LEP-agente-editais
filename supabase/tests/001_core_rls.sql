-- =====================================================================
-- Testes de permissões (RLS) do schema core.
-- Executa tudo dentro de uma transação e desfaz no final (ROLLBACK):
-- nenhum dado permanece no banco.
-- Uso: pnpm db:test
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

begin;

-- ---------------------------------------------------------------------
-- Utilitários de teste (existem só durante a transação)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Cenário: org A (LEP) com admin, editor e viewer; org B com outro admin.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@teste.local',  '{"full_name":"Admin A"}'),
  ('00000000-0000-0000-0000-00000000000e', 'editor@teste.local', '{"full_name":"Editor A"}'),
  ('00000000-0000-0000-0000-00000000000f', 'viewer@teste.local', '{}'),
  ('00000000-0000-0000-0000-0000000000b0', 'outsider@teste.local', '{}');

insert into core.organizations (id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', 'org-b-teste');

insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e', 'editor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'viewer'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b0', 'admin');

insert into core.ai_usage (org_id, purpose, provider, model, status) values
  ('10000000-0000-0000-0000-00000000000a', 'teste', 'fake', 'fake-model', 'success');

select tests.ok(
  (select count(*) = 4 from core.profiles where email like '%@teste.local'),
  'perfil criado automaticamente para cada novo usuário');
select tests.ok(
  (select full_name = 'Admin A' from core.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'nome completo copiado dos metadados do cadastro');

-- ---------------------------------------------------------------------
-- Visitante não autenticado (anon)
-- ---------------------------------------------------------------------
set local role anon;
select tests.throws('select * from core.organizations', 'anon não acessa o schema core');
reset role;

-- ---------------------------------------------------------------------
-- VIEWER
-- ---------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000f');

select tests.ok((select count(*) = 1 from core.organizations), 'viewer vê somente a própria organização');
select tests.ok((select count(*) = 3 from core.memberships), 'viewer vê a equipe da própria organização');
select tests.ok((select count(*) = 3 from core.profiles where email like '%@teste.local'), 'viewer vê perfis da própria org, não de outras');
select tests.ok(core.role_in_org('10000000-0000-0000-0000-00000000000a') = 'viewer', 'role_in_org retorna viewer');
select tests.ok(not core.has_role('10000000-0000-0000-0000-00000000000a', 'editor'), 'viewer não tem nível editor');
select tests.ok(
  tests.affected($$update core.organizations set name = 'Hack' where id = '10000000-0000-0000-0000-00000000000a'$$) = 0,
  'viewer não altera a organização');
select tests.throws(
  $$insert into core.memberships (org_id, user_id, role) values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b0', 'admin')$$,
  'viewer não adiciona membros');
select tests.ok(
  tests.affected($$update core.memberships set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000f'$$) = 0,
  'viewer não se promove a admin');
select tests.ok((select count(*) = 0 from core.audit_log), 'viewer não lê a auditoria');
select tests.ok((select count(*) = 0 from core.ai_usage), 'viewer não lê custos de IA');
select tests.ok(
  tests.affected($$update core.profiles set full_name = 'Viewer A' where id = '00000000-0000-0000-0000-00000000000f'$$) = 1,
  'usuário edita o próprio nome');
select tests.ok(
  tests.affected($$update core.profiles set full_name = 'X' where id = '00000000-0000-0000-0000-00000000000a'$$) = 0,
  'usuário não edita o perfil de outra pessoa');
select tests.throws(
  $$update core.profiles set email = 'x@x.com' where id = '00000000-0000-0000-0000-00000000000f'$$,
  'e-mail do perfil não é editável pelo usuário (vem do Auth)');

-- ---------------------------------------------------------------------
-- EDITOR
-- ---------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000e');

select tests.ok(core.has_role('10000000-0000-0000-0000-00000000000a', 'editor'), 'editor tem nível editor');
select tests.ok(not core.has_role('10000000-0000-0000-0000-00000000000a', 'admin'), 'editor não tem nível admin');
select tests.ok(
  tests.affected($$update core.memberships set role = 'viewer' where user_id = '00000000-0000-0000-0000-00000000000a'$$) = 0,
  'editor não altera papéis');
select tests.throws(
  $$insert into core.ai_usage (org_id, purpose, provider, model, status) values ('10000000-0000-0000-0000-00000000000a', 'x', 'x', 'x', 'success')$$,
  'usuário não grava custos de IA diretamente (só o servidor)');

-- ---------------------------------------------------------------------
-- ADMIN
-- ---------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');

select tests.ok((select count(*) = 1 from core.organizations), 'admin da org A não vê a org B');
select tests.ok(
  tests.affected($$update core.organizations set name = 'Org A Renomeada' where id = '10000000-0000-0000-0000-00000000000a'$$) = 1,
  'admin altera a própria organização');
select tests.ok(
  tests.affected($$update core.memberships set role = 'viewer' where user_id = '00000000-0000-0000-0000-00000000000e'$$) = 1,
  'admin altera papel de membro');
select tests.throws(
  $$update core.memberships set org_id = '10000000-0000-0000-0000-00000000000b' where user_id = '00000000-0000-0000-0000-00000000000e'$$,
  'admin não move membro para outra organização');
select tests.throws(
  $$update core.memberships set role = 'editor' where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'último admin não pode se rebaixar');
select tests.throws(
  $$delete from core.memberships where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'último admin não pode ser removido');
select tests.throws(
  $$insert into core.memberships (org_id, user_id, role) values ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000e', 'admin')$$,
  'admin da org A não adiciona membros na org B');
select tests.ok(
  tests.affected($$update core.memberships set role = 'viewer' where org_id = '10000000-0000-0000-0000-00000000000b'$$) = 0,
  'admin da org A não altera membros da org B');
select tests.ok((select count(*) = 1 from core.ai_usage), 'admin lê custos de IA da própria org');
select tests.ok(
  (select count(*) >= 2 from core.audit_log where actor_id = '00000000-0000-0000-0000-00000000000a'),
  'alterações do admin registradas na auditoria com autor');
select tests.ok(
  (select count(*) = 0 from core.audit_log where org_id = '10000000-0000-0000-0000-00000000000b'),
  'admin não vê auditoria de outra organização');

reset role;

-- ---------------------------------------------------------------------
-- Operações do servidor (superusuário / service_role)
-- ---------------------------------------------------------------------
select tests.ok(
  tests.affected($$delete from core.organizations where id = '10000000-0000-0000-0000-00000000000b'$$) = 1,
  'excluir organização remove membros em cascata (proteção do último admin não bloqueia)');
select tests.ok(
  tests.affected($$delete from auth.users where id = '00000000-0000-0000-0000-00000000000e'$$) = 1,
  'excluir usuário remove perfil e vínculos em cascata');
select tests.ok(
  (select count(*) = 0 from core.memberships where user_id = '00000000-0000-0000-0000-00000000000e'),
  'vínculos do usuário excluído foram removidos');

\echo 'Todos os testes de RLS passaram.'

rollback;
