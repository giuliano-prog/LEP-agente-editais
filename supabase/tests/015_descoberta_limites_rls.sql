-- =====================================================================
-- Testes da limite de chamadas da descoberta web (ADR-0024).
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

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000d', 'admin@teste.local'),
  ('00000000-0000-0000-0000-00000000000f', 'viewer@teste.local'),
  ('00000000-0000-0000-0000-0000000000b0', 'admin-b@teste.local');
insert into core.organizations (id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', 'org-b-teste');
insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'viewer'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b0', 'admin');

-- Servidor (chave de serviço) reserva chamadas até o teto mensal ----------------------
select tests.ok(core.reserve_search_request('10000000-0000-0000-0000-00000000000a', 3), '1ª reserva aceita');
select tests.ok(core.reserve_search_request('10000000-0000-0000-0000-00000000000a', 3), '2ª reserva aceita');
select tests.ok(core.reserve_search_request('10000000-0000-0000-0000-00000000000a', 3), '3ª reserva aceita (chega ao teto)');
select tests.ok(not core.reserve_search_request('10000000-0000-0000-0000-00000000000a', 3), '4ª reserva recusada: teto mensal atingido');
select tests.ok(not core.reserve_search_request('10000000-0000-0000-0000-00000000000a', 3), 'continua recusando depois do teto');
select tests.ok(
  (select requests = 3 from core.search_api_usage
   where org_id = '10000000-0000-0000-0000-00000000000a'
     and month = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')),
  'contador do mês (fuso de São Paulo) nunca passa do teto');
select tests.ok(core.reserve_search_request('10000000-0000-0000-0000-00000000000a', 5), 'teto maior (novo valor da variável) libera novas reservas');
select tests.ok(core.reserve_search_request('10000000-0000-0000-0000-00000000000b', 3), 'contador é por organização');
select tests.ok(not core.reserve_search_request('10000000-0000-0000-0000-00000000000b', 0), 'teto zero nunca reserva');
select tests.ok(not core.reserve_search_request(null, 10), 'organização ausente nunca reserva');
select tests.ok(
  (select count(*) = 1 from core.search_api_usage where org_id = '10000000-0000-0000-0000-00000000000a'),
  'uma linha por organização e mês');
select tests.throws(
  $$insert into core.search_api_usage (org_id, month) values ('10000000-0000-0000-0000-00000000000a', '2026-13')$$,
  'mês precisa ser AAAA-MM válido');

-- Execução registra chamadas e o limite atingido
insert into core.discovery_runs (org_id, trigger, status, api_requests, limit_reached)
values ('10000000-0000-0000-0000-00000000000a', 'manual', 'partial', 10, 'per_run');
select tests.throws(
  $$insert into core.discovery_runs (org_id, trigger, status, limit_reached) values ('10000000-0000-0000-0000-00000000000a', 'manual', 'ok', 'infinito')$$,
  'limite atingido só aceita valores conhecidos');

set local role authenticated;

-- administrador lê o contador; ninguém reserva pela sessão -------------------------------
select tests.login('00000000-0000-0000-0000-00000000000d');
select tests.ok(
  (select count(*) = 1 and bool_and(requests = 4) from core.search_api_usage),
  'Administrador lê o contador da própria organização');
select tests.throws(
  $$select core.reserve_search_request('10000000-0000-0000-0000-00000000000a', 1000)$$,
  'reserva só pelo servidor (sessão de usuário não executa a função)');
select tests.throws(
  $$update core.search_api_usage set requests = 0$$,
  'Administrador não zera o contador pela tela');
select tests.throws(
  $$insert into core.search_api_usage (org_id, month, requests) values ('10000000-0000-0000-0000-00000000000a', '2026-01', 0)$$,
  'contador não é gravado pela sessão de usuário');

select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok((select count(*) = 0 from core.search_api_usage), 'Equipe não vê o contador');
select tests.login('00000000-0000-0000-0000-0000000000b0');
select tests.ok(
  (select count(*) = 1 and bool_and(org_id = '10000000-0000-0000-0000-00000000000b') from core.search_api_usage),
  'outra organização vê só o próprio contador');

reset role;

\echo 'Todos os testes do limite de chamadas da descoberta web passaram.'

rollback;
