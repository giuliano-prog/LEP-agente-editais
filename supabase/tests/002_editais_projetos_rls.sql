-- =====================================================================
-- Testes de permissões (RLS) de core.editais e core.projetos.
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

-- Cenário: org A com admin, editor e viewer; org B com um admin.
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

insert into core.editais (id, org_id, title, status) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Edital da org A', 'open'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Edital da org B', 'open');

insert into core.projetos (id, org_id, title, format, stage) values
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Projeto B', 'series', 'development');

select tests.ok(
  (select review_status = 'pending' from core.editais where id = '20000000-0000-0000-0000-00000000000a'),
  'edital novo começa como revisão pendente');

-- anon ----------------------------------------------------------------
set local role anon;
select tests.throws('select * from core.editais', 'anon não lê editais');
select tests.throws('select * from core.projetos', 'anon não lê projetos');
reset role;

-- viewer --------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000f');

select tests.ok((select count(*) = 1 from core.editais where title like 'Edital da org%'), 'viewer vê apenas editais da própria org');
select tests.ok((select count(*) = 0 from core.projetos), 'viewer não vê projetos de outra org');
select tests.throws(
  $$insert into core.projetos (org_id, title, format, stage) values ('10000000-0000-0000-0000-00000000000a', 'X Viewer', 'feature_film', 'development')$$,
  'viewer não cadastra projetos');
select tests.ok(
  tests.affected($$update core.editais set title = 'Hack' where id = '20000000-0000-0000-0000-00000000000a'$$) = 0,
  'viewer não altera editais');

-- editor --------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000e');

select tests.ok(
  tests.affected($$insert into core.projetos (org_id, title, format, genre, stage, budget) values ('10000000-0000-0000-0000-00000000000a', 'Projeto A', 'feature_film', 'documentary', 'production', 2000000)$$) = 1,
  'editor cadastra projeto na própria org');
select tests.throws(
  $$insert into core.projetos (org_id, title, format, stage) values ('10000000-0000-0000-0000-00000000000b', 'Intruso', 'feature_film', 'development')$$,
  'editor não cadastra projeto em outra org');
select tests.throws(
  $$insert into core.projetos (org_id, title, format, stage) values ('10000000-0000-0000-0000-00000000000a', 'Formato inválido', 'novela', 'development')$$,
  'formato fora do vocabulário é rejeitado');
select tests.throws(
  $$insert into core.projetos (org_id, title, format, stage, budget) values ('10000000-0000-0000-0000-00000000000a', 'Negativo', 'feature_film', 'development', -1)$$,
  'orçamento negativo é rejeitado');
select tests.throws(
  $$update core.projetos set org_id = '10000000-0000-0000-0000-00000000000b' where title = 'Projeto A'$$,
  'projeto não pode ser movido para outra org');
select tests.ok(
  tests.affected($$update core.projetos set stage = 'post_production' where title = 'Projeto A'$$) = 1,
  'editor atualiza projeto da própria org');
select tests.ok(
  tests.affected($$delete from core.projetos where title = 'Projeto A'$$) = 0,
  'editor não exclui projetos (somente admin)');
select tests.ok(
  tests.affected($$update core.editais set review_status = 'validated' where id = '20000000-0000-0000-0000-00000000000a'$$) = 1,
  'editor/revisor valida edital da própria org');
select tests.ok(
  tests.affected($$update core.editais set title = 'Hack' where id = '20000000-0000-0000-0000-00000000000b'$$) = 0,
  'editor não altera edital de outra org');

-- admin ---------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');

select tests.ok((select count(*) = 1 from core.projetos), 'admin vê só projetos da própria org');
select tests.ok(
  (select count(*) >= 1 from core.audit_log where table_name = 'projetos'),
  'alterações em projetos ficam na auditoria');
select tests.ok(
  tests.affected($$delete from core.projetos where title = 'Projeto A'$$) = 1,
  'admin exclui projeto da própria org');

reset role;

\echo 'Todos os testes de RLS de editais e projetos passaram.'

rollback;
