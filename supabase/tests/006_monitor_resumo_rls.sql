-- =====================================================================
-- Testes do resumo detalhado da varredura (core.monitor_runs, etapa 2).
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

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@teste.local'),
  ('00000000-0000-0000-0000-00000000000f', 'viewer@teste.local'),
  ('00000000-0000-0000-0000-0000000000b0', 'admin-b@teste.local');
insert into core.organizations (id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', 'org-b-teste');
insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'viewer'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b0', 'admin');
insert into core.edital_sources (id, org_id, name, list_url, active) values
  ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Fonte A', 'https://a.exemplo.org/editais/', true),
  ('40000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Fonte A2', 'https://a2.exemplo.org/editais/', false),
  ('40000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Fonte B', 'https://b.exemplo.org/editais/', true);

-- Histórico antigo (antes do resumo detalhado) continua válido: contadores novos = 0.
insert into core.monitor_runs (org_id, source_id, trigger, status, links_found, imported, skipped) values
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'cron', 'ok', 30, 1, 2);
select tests.ok(
  (select found = 0 and duplicates = 0 and updated = 0 and pending_review = 0 and blocked_by_robots = 0
          and failed = 0 and execution_id is null and imported = 1 and skipped = 2
   from core.monitor_runs where links_found = 30),
  'linhas antigas do histórico são preservadas, com contadores novos zerados');

-- Execução nova (servidor): uma linha por fonte, agrupadas por execution_id.
insert into core.monitor_runs (org_id, source_id, trigger, status, links_found, found, imported, duplicates,
                               rejected, pending_review, blocked_by_robots, failed, skipped, execution_id) values
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'manual', 'ok', 40, 5, 2, 2,
   1, 2, 1, 0, 1, '50000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-00000000000b', 'manual', 'ok', 10, 1, 1, 0,
   0, 1, 0, 0, 0, '50000000-0000-0000-0000-000000000001');
select tests.ok(
  (select count(*) = 2 from core.monitor_runs where execution_id = '50000000-0000-0000-0000-000000000001'),
  'execution_id agrupa as linhas de uma mesma execução');
select tests.throws(
  $$insert into core.monitor_runs (org_id, trigger, status, found) values ('10000000-0000-0000-0000-00000000000a', 'cron', 'ok', null)$$,
  'contadores novos não aceitam nulo');

-- Contagem de fontes ativas (a mesma consulta da interface e do motor).
select tests.ok(
  (select count(*) = 1 from core.edital_sources where org_id = '10000000-0000-0000-0000-00000000000a' and active),
  'servidor conta 1 fonte ativa na Org A');

-- viewer --------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok(
  (select count(*) = 1 from core.edital_sources where org_id = '10000000-0000-0000-0000-00000000000a' and active),
  'interface (sessão) conta as mesmas fontes ativas que o servidor');
select tests.ok(
  (select count(*) = 2 and sum(found) = 5 and sum(pending_review) = 2 from core.monitor_runs),
  'viewer lê o resumo detalhado apenas da própria org');
select tests.throws(
  $$update core.monitor_runs set found = 99$$,
  'usuários não alteram o histórico');

-- admin de outra organização ------------------------------------------
select tests.login('00000000-0000-0000-0000-0000000000b0');
select tests.ok(
  (select count(*) = 1 and sum(found) = 1 from core.monitor_runs),
  'admin da Org B não vê o histórico da Org A');

reset role;

\echo 'Todos os testes do resumo da varredura passaram.'

rollback;
