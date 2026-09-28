-- =====================================================================
-- Testes da taxonomia de elegibilidade (etapa 5).
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
  ('00000000-0000-0000-0000-00000000000f', 'viewer@teste.local');
insert into core.organizations (id, name, slug) values ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste');
insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e', 'editor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'viewer');

-- Situação anterior à etapa 5: descarte automático por território e descarte humano.
insert into core.editais (id, org_id, title, origin, review_status, triage_reason) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Chamada exclusiva de outro município', 'monitor', 'discarded',
   'Descartado automaticamente — Exclusivo para proponentes de Município de Rio de Janeiro/RJ; a LEP Filmes é sediada em São Paulo/SP. Trecho: “sediadas no municipio do rio de janeiro”'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Prêmio de música', 'monitor', 'discarded', 'Fora do escopo (decisão da equipe)'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'Edital manual', 'manual', 'validated', null);

select tests.ok(
  (select bool_and(eligibility_status = 'not_confirmed' and eligibility_source = 'auto') from core.editais),
  'padrão: elegibilidade não confirmada (nunca não elegível por omissão)');

-- Reaplica a migração (idempotência + conversão dos descartes automáticos).
set client_min_messages = warning;
\i supabase/migrations/20261002120000_elegibilidade.sql
\i supabase/migrations/20261002120000_elegibilidade.sql
reset client_min_messages;

select tests.ok(
  (select review_status = 'pending' and eligibility_status = 'territorial_restriction'
          and eligibility_reason = 'Exclusivo para proponentes de Município de Rio de Janeiro/RJ; a LEP Filmes é sediada em São Paulo/SP.'
          and eligibility_evidence = 'sediadas no municipio do rio de janeiro'
          and triage_reason is null
   from core.editais where id = '20000000-0000-0000-0000-0000000000a1'),
  'descarte automático por território vira restrição territorial visível, com motivo e trecho, em triagem pendente');
select tests.ok(
  (select review_status = 'discarded' and triage_reason = 'Fora do escopo (decisão da equipe)'
          and eligibility_status = 'not_confirmed'
   from core.editais where id = '20000000-0000-0000-0000-0000000000a2'),
  'descarte feito por pessoa não é alterado');
select tests.throws(
  $$update core.editais set eligibility_status = 'talvez' where id = '20000000-0000-0000-0000-0000000000a3'$$,
  'elegibilidade só aceita os sete valores');
select tests.throws(
  $$update core.editais set eligibility_source = 'ia' where id = '20000000-0000-0000-0000-0000000000a3'$$,
  'origem da elegibilidade: auto ou manual');

-- editor ----------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000e');
select tests.ok(
  tests.affected($$update core.editais set eligibility_status = 'not_eligible', eligibility_source = 'manual',
                   eligibility_reason = 'Exige CPB de obra concluída' where id = '20000000-0000-0000-0000-0000000000a3'$$) = 1,
  'Diretoria (editor) define elegibilidade manualmente');

-- viewer ----------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok((select count(*) = 3 from core.editais), 'Equipe vê todos, inclusive os com restrição');
select tests.ok(
  tests.affected($$update core.editais set eligibility_status = 'eligible'$$) = 0,
  'Equipe (viewer) não altera elegibilidade');

-- admin: parcerias ainda sem tela ------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.ok(
  (select partner_territories = '{}' from core.organizations where id = '10000000-0000-0000-0000-00000000000a'),
  'parcerias: espaço criado, vazio por padrão');
select tests.throws(
  $$update core.organizations set partner_territories = '{RJ}' where id = '10000000-0000-0000-0000-00000000000a'$$,
  'parcerias não são alteradas pela API nesta etapa (sem tela)');

reset role;

\echo 'Todos os testes de elegibilidade passaram.'

rollback;
