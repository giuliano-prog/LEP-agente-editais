-- =====================================================================
-- Testes da detecção de alterações e retificações (etapa 10).
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

select tests.ok(
  (select last_checked_at is null and content_hash is null from core.editais where id = '20000000-0000-0000-0000-0000000000a1'),
  'editais existentes ainda sem linha de base');
select tests.throws(
  $$update core.editais set content_hash = 'abc' where id = '20000000-0000-0000-0000-0000000000a1'$$,
  'hash do conteúdo precisa ser SHA-256');

-- Servidor (varredura) registra a alteração.
insert into core.edital_changes (id, org_id, edital_id, kind, summary, changes) values
  ('60000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'rectification',
   '1 retificação(ões)/errata(s) nova(s); alteração em: Prazo final de inscrição.',
   '[{"field": "deadline", "before": "2026-11-30", "after": "2026-12-15"}]');
select tests.throws(
  $$insert into core.edital_changes (org_id, edital_id, kind, summary) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'outro', 'x')$$,
  'tipo de alteração só aceita campos alterados ou retificação');

-- viewer --------------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok((select count(*) = 1 and bool_and(status = 'pending') from core.edital_changes), 'Equipe vê a alteração pendente');
select tests.ok(
  tests.affected($$update core.edital_changes set status = 'dismissed'$$) = 0,
  'Equipe não resolve alterações');

-- outra organização ------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-0000000000b0');
select tests.ok((select count(*) = 0 from core.edital_changes), 'outra organização não vê');
select tests.throws(
  $$insert into core.edital_changes (org_id, edital_id, kind, summary) values ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000a1', 'fields_changed', 'x')$$,
  'não registra alteração em edital de outra organização');

-- editor --------------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000e');
select tests.ok(
  tests.affected($$insert into core.edital_changes (org_id, edital_id, kind, summary) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'fields_changed', 'Verificação manual')$$) = 1,
  'Diretoria registra alteração pelo botão “Verificar alterações agora”');
select tests.ok(
  tests.affected($$update core.edital_changes set status = 'applied' where id = '60000000-0000-0000-0000-0000000000a1'$$) = 1,
  'Diretoria aplica os valores novos');
select tests.ok(
  (select resolved_by = '00000000-0000-0000-0000-00000000000e' and resolved_at is not null
   from core.edital_changes where id = '60000000-0000-0000-0000-0000000000a1'),
  'o banco registra quem resolveu e quando');
select tests.throws(
  $$update core.edital_changes set summary = 'editado' where id = '60000000-0000-0000-0000-0000000000a1'$$,
  'o conteúdo da alteração não é editável (só o status)');
select tests.throws(
  $$update core.edital_changes set status = 'talvez'$$,
  'status só aceita pendente / aplicada / ignorada');

reset role;
select tests.ok(
  (select count(*) >= 2 from core.audit_log where table_name = 'edital_changes'),
  'alterações ficam na auditoria');

\echo 'Todos os testes de alterações passaram.'

rollback;
