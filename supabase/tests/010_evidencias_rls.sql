-- =====================================================================
-- Testes da evidência por campo (etapa 7).
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
  ('00000000-0000-0000-0000-00000000000e', 'editor@teste.local'),
  ('00000000-0000-0000-0000-00000000000f', 'viewer@teste.local');
insert into core.organizations (id, name, slug) values ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste');
insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e', 'editor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'viewer');
insert into core.editais (id, org_id, title) values ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Edital A');

select tests.ok(
  (select field_evidence = '{}'::jsonb and extraction_notes = '{}' and extracted_at is null
   from core.editais where id = '20000000-0000-0000-0000-0000000000a1'),
  'editais existentes: sem evidências, sem avisos');
select tests.throws(
  $$update core.editais set field_evidence = '[1]' where id = '20000000-0000-0000-0000-0000000000a1'$$,
  'evidências precisam ser um objeto JSON');
select tests.throws(
  $$update core.editais set field_evidence = jsonb_build_object('x', repeat('a', 70000)) where id = '20000000-0000-0000-0000-0000000000a1'$$,
  'evidências têm tamanho limitado');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000e');
select tests.ok(
  tests.affected($$update core.editais set field_evidence = '{"deadline": {"value": "2026-11-30", "snippet": "Inscrições até 30/11/2026", "source": "pdf"}}',
                   extraction_notes = array['PDF longo: só as primeiras páginas foram lidas.'], extracted_at = now()
                   where id = '20000000-0000-0000-0000-0000000000a1'$$) = 1,
  'Diretoria grava evidências (cadastro manual com extração)');

select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok(
  (select field_evidence -> 'deadline' ->> 'source' = 'pdf' from core.editais),
  'Equipe lê as evidências');
select tests.ok(
  tests.affected($$update core.editais set field_evidence = '{}'$$) = 0,
  'Equipe não altera evidências');

reset role;

\echo 'Todos os testes de evidências passaram.'

rollback;
