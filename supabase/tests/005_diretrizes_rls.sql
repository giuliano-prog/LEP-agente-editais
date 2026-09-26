-- =====================================================================
-- Testes das diretrizes LEP (sede do proponente e território dos editais).
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
  ('00000000-0000-0000-0000-00000000000e', 'editor@teste.local');
insert into core.organizations (id, name, slug) values ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste');
insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e', 'editor');

select tests.ok(
  (select hq_state = 'SP' and hq_city = 'São Paulo' from core.organizations where slug = 'lep-filmes'),
  'sede da LEP Filmes definida como São Paulo/SP');
select tests.throws(
  $$update core.organizations set hq_state = 'São Paulo' where slug = 'org-a-teste'$$,
  'UF da sede precisa ter 2 letras maiúsculas');
insert into core.editais (org_id, title) values ('10000000-0000-0000-0000-00000000000a', 'Edital T');
select tests.ok(
  (select eligible_territories = '{}' and triage_reason is null from core.editais where title = 'Edital T'),
  'edital novo começa sem território registrado');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000e');
select tests.ok(
  tests.affected($$update core.organizations set hq_state = 'RJ' where id = '10000000-0000-0000-0000-00000000000a'$$) = 0,
  'editor não altera a sede da organização');
select tests.ok(
  tests.affected($$update core.editais set eligible_territories = array['BR'] where title = 'Edital T'$$) = 1,
  'editor registra território do edital');

select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.ok(
  tests.affected($$update core.organizations set hq_state = 'SP', hq_city = 'São Paulo' where id = '10000000-0000-0000-0000-00000000000a'$$) = 1,
  'administrador define a sede do proponente');
reset role;

\echo 'Todos os testes das diretrizes passaram.'

rollback;
