-- =====================================================================
-- Testes de membros: status do vínculo (convidado / ativo / suspenso).
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
  ('00000000-0000-0000-0000-00000000000c', 'convidada@teste.local'),
  ('00000000-0000-0000-0000-00000000000d', 'segundo-admin@teste.local'),
  ('00000000-0000-0000-0000-00000000000f', 'viewer@teste.local'),
  ('00000000-0000-0000-0000-0000000000b0', 'admin-b@teste.local');
insert into core.organizations (id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', 'org-b-teste');
-- Servidor (sem usuário): vínculos já ativos, como os existentes antes da migração.
insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'viewer'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b0', 'admin');
select tests.ok(
  (select bool_and(status = 'active' and accepted_at is not null) from core.memberships),
  'vínculos criados pelo servidor continuam ativos');
insert into core.editais (org_id, title) values ('10000000-0000-0000-0000-00000000000a', 'Edital da Org A');

-- admin convida pela interface ------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.throws(
  $$insert into core.memberships (org_id, user_id, role, status) values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'editor', 'active')$$,
  'interface não escolhe o status ao criar vínculo');
insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'editor');
select tests.ok(
  (select status = 'invited' and invited_by = '00000000-0000-0000-0000-00000000000a' and invited_at is not null
   from core.memberships where user_id = '00000000-0000-0000-0000-00000000000c'),
  'vínculo criado pela interface nasce como convite');
select tests.throws(
  $$update core.memberships set status = 'active' where user_id = '00000000-0000-0000-0000-00000000000c'$$,
  'admin não marca convite como aceito');
select tests.throws(
  $$update core.memberships set invited_at = now() where user_id = '00000000-0000-0000-0000-00000000000c'$$,
  'interface não altera datas do vínculo');

-- convidada sem acesso até entrar ---------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000c');
select tests.ok((select count(*) = 0 from core.editais), 'convidada não vê editais');
select tests.ok(not core.has_role('10000000-0000-0000-0000-00000000000a', 'viewer'), 'convite não dá papel');
select tests.ok(
  (select count(*) = 1 and bool_and(status = 'invited') from core.memberships),
  'convidada vê apenas o próprio vínculo (status convidado)');
select tests.ok(core.accept_my_invitations() = 1, 'ao entrar, a própria pessoa aceita o convite');
select tests.ok(core.has_role('10000000-0000-0000-0000-00000000000a', 'editor'), 'após aceitar: perfil Diretoria (editor) ativo');
select tests.ok((select count(*) = 1 from core.editais), 'após aceitar: vê os editais da organização');
select tests.ok(core.accept_my_invitations() = 0, 'aceitar de novo não altera nada');

-- suspender / reativar ---------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok(
  tests.affected($$update core.memberships set status = 'suspended' where user_id = '00000000-0000-0000-0000-00000000000c'$$) = 0,
  'Equipe (viewer) não suspende ninguém');

select tests.login('00000000-0000-0000-0000-0000000000b0');
select tests.ok(
  tests.affected($$update core.memberships set status = 'suspended' where user_id = '00000000-0000-0000-0000-00000000000c'$$) = 0,
  'admin de outra organização não suspende vínculos da Org A');

select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.ok(
  tests.affected($$update core.memberships set status = 'suspended' where user_id = '00000000-0000-0000-0000-00000000000c'$$) = 1,
  'admin suspende o acesso');
select tests.ok(
  (select suspended_by = '00000000-0000-0000-0000-00000000000a' and suspended_at is not null
   from core.memberships where user_id = '00000000-0000-0000-0000-00000000000c'),
  'suspensão registra quem e quando');
select tests.throws(
  $$update core.memberships set status = 'suspended' where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'ninguém suspende o próprio acesso');

select tests.login('00000000-0000-0000-0000-00000000000c');
select tests.ok(not core.has_role('10000000-0000-0000-0000-00000000000a', 'viewer'), 'suspensa perde o acesso');
select tests.ok((select count(*) = 0 from core.editais), 'suspensa não vê editais');
select tests.ok(core.accept_my_invitations() = 0, 'suspensa não se reativa sozinha');
select tests.ok(
  tests.affected($$update core.memberships set status = 'active' where user_id = '00000000-0000-0000-0000-00000000000c'$$) = 0,
  'suspensa não altera o próprio vínculo');

select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.ok(
  tests.affected($$update core.memberships set status = 'active' where user_id = '00000000-0000-0000-0000-00000000000c'$$) = 1,
  'admin reativa o acesso');
select tests.throws(
  $$update core.memberships set status = 'invited' where user_id = '00000000-0000-0000-0000-00000000000c'$$,
  'quem já entrou não volta a ser convite');

-- convite suspenso nunca aceito volta a ser convite ------------------------
insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'admin');
select tests.ok(
  tests.affected($$update core.memberships set status = 'suspended' where user_id = '00000000-0000-0000-0000-00000000000d'$$) = 1,
  'admin suspende um convite pendente');
select tests.throws(
  $$update core.memberships set status = 'active' where user_id = '00000000-0000-0000-0000-00000000000d'$$,
  'convite nunca aceito não é reativado como ativo');
select tests.ok(
  tests.affected($$update core.memberships set status = 'invited' where user_id = '00000000-0000-0000-0000-00000000000d'$$) = 1,
  'convite nunca aceito é reativado como convite');

-- último administrador ativo ---------------------------------------------
select tests.throws(
  $$update core.memberships set role = 'editor' where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'último admin ATIVO não perde o papel (convite de admin não conta)');

reset role;
select tests.ok(
  (select count(*) >= 3 from core.audit_log where table_name = 'memberships' and action = 'update'),
  'mudanças de status ficam na auditoria');

\echo 'Todos os testes de membros passaram.'

rollback;
