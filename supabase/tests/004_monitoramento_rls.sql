-- =====================================================================
-- Testes de permissões do monitoramento (fontes, histórico, triagem).
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

insert into core.edital_sources (id, org_id, name, list_url) values
  ('40000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Fonte B', 'https://b.exemplo.org/editais/');

-- Varredura (servidor / service_role) grava histórico e importa editais
insert into core.edital_sources (id, org_id, name, list_url) values
  ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Fonte A', 'https://a.exemplo.org/editais/');
insert into core.monitor_runs (org_id, source_id, trigger, status, links_found, imported) values
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'cron', 'ok', 30, 1);
insert into core.editais (id, org_id, title, official_url, origin, source_id, discovered_at) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Edital encontrado', 'https://a.exemplo.org/editais/1/',
   'monitor', '40000000-0000-0000-0000-00000000000a', now());

select tests.ok(
  (select origin = 'monitor' and discovered_at is not null from core.editais where id = '20000000-0000-0000-0000-00000000000a'),
  'edital importado registra origem e data de descoberta');
select tests.throws(
  $$insert into core.edital_sources (org_id, name, list_url) values ('10000000-0000-0000-0000-00000000000a', 'Fonte FTP', 'ftp://a.exemplo.org/')$$,
  'fonte precisa de link http(s)');
select tests.throws(
  $$insert into core.edital_sources (org_id, name, list_url) values ('10000000-0000-0000-0000-00000000000a', 'Duplicada', 'https://a.exemplo.org/editais/')$$,
  'mesma fonte não é cadastrada duas vezes');

-- viewer --------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok((select count(*) = 1 from core.edital_sources), 'viewer vê as fontes da própria org');
select tests.ok((select count(*) = 1 from core.monitor_runs), 'viewer vê o histórico da própria org');
select tests.throws(
  $$insert into core.edital_sources (org_id, name, list_url) values ('10000000-0000-0000-0000-00000000000a', 'X', 'https://x.org/')$$,
  'viewer não cadastra fontes');
select tests.throws(
  $$insert into core.monitor_runs (org_id, trigger, status) values ('10000000-0000-0000-0000-00000000000a', 'manual', 'ok')$$,
  'usuários não gravam histórico (só o servidor)');

-- editor --------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000e');
select tests.throws(
  $$insert into core.edital_sources (org_id, name, list_url) values ('10000000-0000-0000-0000-00000000000a', 'X', 'https://x.org/')$$,
  'editor não cadastra fontes (somente admin)');
select tests.ok(
  tests.affected($$update core.editais set review_status = 'discarded' where id = '20000000-0000-0000-0000-00000000000a'$$) = 1,
  'editor descarta edital encontrado pela varredura (triagem)');

-- admin ---------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.ok(
  tests.affected($$insert into core.edital_sources (org_id, name, list_url, link_contains) values ('10000000-0000-0000-0000-00000000000a', 'Nova', 'https://nova.exemplo.org/editais/', '/editais/')$$) = 1,
  'admin cadastra fonte');
select tests.ok(
  tests.affected($$update core.edital_sources set active = false where name = 'Nova'$$) = 1,
  'admin pausa fonte');
select tests.throws(
  $$update core.edital_sources set last_status = 'ok' where name = 'Nova'$$,
  'status da varredura não é editável pelo usuário');
select tests.ok(
  tests.affected($$update core.edital_sources set active = false where name = 'Fonte B'$$) = 0,
  'admin não altera fontes de outra org');
select tests.ok(
  tests.affected($$delete from core.edital_sources where name = 'Nova'$$) = 1,
  'admin remove fonte');

reset role;

\echo 'Todos os testes do monitoramento passaram.'

rollback;
