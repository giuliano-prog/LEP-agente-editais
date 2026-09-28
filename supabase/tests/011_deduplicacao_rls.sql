-- =====================================================================
-- Testes da deduplicação multi-fonte (etapa 8).
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
  ('00000000-0000-0000-0000-00000000000f', 'viewer@teste.local'),
  ('00000000-0000-0000-0000-0000000000b0', 'admin-b@teste.local');
insert into core.organizations (id, name, slug) values ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste'), ('10000000-0000-0000-0000-00000000000b', 'Org B', 'org-b-teste');
insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e', 'editor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'viewer'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b0', 'admin');
insert into core.edital_sources (id, org_id, name, list_url) values
  ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Fonte A', 'https://a.exemplo.org/editais/'),
  ('40000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'Agregador', 'https://agregador.exemplo.org/');
insert into core.editais (id, org_id, title, origin, canonical_key) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Edital nº 5/2026 Longas', 'monitor', 'n:5/2026');
insert into core.editais (id, org_id, title, origin, possible_duplicate_of, possible_duplicate_reason) values
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Edital 5/2026 Longas (cópia)', 'manual',
   '20000000-0000-0000-0000-0000000000a1', 'Provavelmente o mesmo edital: mesmo número (5/2026)');

-- Servidor registra avistamentos (origem + outra fonte).
insert into core.edital_sightings (org_id, edital_id, source_id, url, title, match_reason) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-00000000000a', 'https://a.exemplo.org/editais/5-2026/', 'Edital 5/2026', 'Primeira fonte onde o edital foi encontrado'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a3', 'https://agregador.exemplo.org/5-2026/', 'Edital 5/2026', 'Mesmo edital: mesmo número (5/2026)');
select tests.throws(
  $$insert into core.edital_sightings (org_id, edital_id, url, match_reason) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'https://agregador.exemplo.org/5-2026/', 'x')$$,
  'mesmo endereço não é registrado duas vezes para o mesmo edital');
select tests.throws(
  $$insert into core.edital_sightings (org_id, edital_id, url, match_reason) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'ftp://x/', 'x')$$,
  'avistamento precisa de endereço http(s)');

-- Fonte removida: o avistamento fica (sem fonte).
delete from core.edital_sources where id = '40000000-0000-0000-0000-0000000000a3';
select tests.ok(
  (select count(*) = 2 and count(source_id) = 1 from core.edital_sightings),
  'remover a fonte preserva os avistamentos');

-- viewer --------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok((select count(*) = 2 from core.edital_sightings), 'Equipe vê onde o edital foi encontrado');
select tests.ok(tests.affected($$delete from core.edital_sightings$$) = 0, 'Equipe não apaga avistamentos');
select tests.throws(
  $$insert into core.edital_sightings (org_id, edital_id, url, match_reason) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'https://z.exemplo.org/', 'x')$$,
  'usuários não gravam avistamentos (só o servidor)');

-- outra organização ------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-0000000000b0');
select tests.ok((select count(*) = 0 from core.edital_sightings), 'outra organização não vê os avistamentos');

-- editor: decide o possível duplicado ----------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000e');
select tests.ok(
  tests.affected($$update core.editais set possible_duplicate_of = null, possible_duplicate_reason = null
                   where id = '20000000-0000-0000-0000-0000000000a2'$$) = 1,
  'Diretoria marca "não é duplicado"');

reset role;
delete from core.editais where id = '20000000-0000-0000-0000-0000000000a1';
select tests.ok((select count(*) = 0 from core.edital_sightings), 'excluir o edital remove os avistamentos dele');

\echo 'Todos os testes de deduplicação passaram.'

rollback;
