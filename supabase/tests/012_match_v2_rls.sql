-- =====================================================================
-- Testes do Match v2 persistido (etapa 9).
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
insert into core.editais (id, org_id, title) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Edital A'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'Edital B');
insert into core.projetos (id, org_id, title, format, stage) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Projeto A', 'feature_film', 'production'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'Projeto B', 'feature_film', 'production');

-- editor grava o cálculo --------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000e');
insert into core.edital_matches (org_id, edital_id, projeto_id, version, score, confidence, level, verdict, factors, blockers, inputs_hash)
values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 'v2', 82.5, 0.8, 'high',
        'compatible_with_pending', '[{"key": "format", "weight": 25, "state": "met"}]', '{}', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
select tests.ok((select count(*) = 1 from core.edital_matches), 'Diretoria grava o Match v2');
select tests.ok(
  tests.affected($$update core.edital_matches set score = 60, level = 'medium' where edital_id = '20000000-0000-0000-0000-0000000000a1'$$) = 1,
  'Diretoria recalcula (atualiza) o Match');
select tests.throws(
  $$insert into core.edital_matches (org_id, edital_id, projeto_id, version, confidence, level, verdict, inputs_hash)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 'v2', 0.5, 'low', 'incompatible', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
  'um único Match por edital × projeto');
select tests.throws(
  $$insert into core.edital_matches (org_id, edital_id, projeto_id, version, confidence, level, verdict, inputs_hash)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000b1', 'v2', 0.5, 'low', 'incompatible', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')$$,
  'não mistura projeto de outra organização');
select tests.throws(
  $$update core.edital_matches set level = 'aprovado'$$,
  'nível só aceita alta/média/baixa/dados insuficientes (nunca "aprovado")');
select tests.throws(
  $$update core.edital_matches set score = 120$$,
  'pontuação entre 0 e 100');

-- viewer ------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok((select count(*) = 1 from core.edital_matches), 'Equipe lê o Match gravado');
select tests.ok(tests.affected($$update core.edital_matches set score = 0$$) = 0, 'Equipe não altera o Match');

-- outra organização --------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-0000000000b0');
select tests.ok((select count(*) = 0 from core.edital_matches), 'outra organização não vê o Match');

reset role;
select tests.ok(
  (select count(*) >= 2 from core.audit_log where table_name = 'edital_matches'),
  'mudanças do Match ficam na auditoria');
delete from core.projetos where id = '30000000-0000-0000-0000-0000000000a1';
select tests.ok((select count(*) = 0 from core.edital_matches), 'excluir o projeto remove o Match dele');

\echo 'Todos os testes do Match v2 passaram.'

rollback;
