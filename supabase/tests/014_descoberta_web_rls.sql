-- =====================================================================
-- Testes da descoberta web e fontes favoritas (ADR-0024).
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
  ('00000000-0000-0000-0000-00000000000e', 'editor@teste.local'),
  ('00000000-0000-0000-0000-00000000000f', 'viewer@teste.local'),
  ('00000000-0000-0000-0000-0000000000b0', 'admin-b@teste.local');
insert into core.organizations (id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B', 'org-b-teste');
insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e', 'editor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'viewer'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b0', 'admin');
insert into core.editais (id, org_id, title, origin) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Edital A (fictício)', 'web_discovery');
insert into core.edital_sources (id, org_id, name, list_url) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Fonte A', 'https://fonte-a.example/editais');

select tests.ok(
  (select not is_favorite and origin = 'manual' from core.edital_sources where id = '30000000-0000-0000-0000-0000000000a1'),
  'fontes existentes: não favoritas e origem manual');
select tests.throws(
  $$update core.edital_sources set origin = 'outra' where id = '30000000-0000-0000-0000-0000000000a1'$$,
  'origem da fonte só aceita valores conhecidos');

-- Servidor (descoberta) grava execução e candidatos.
insert into core.discovery_runs (org_id, trigger, status, provider, queries_run, imported)
values ('10000000-0000-0000-0000-00000000000a', 'manual', 'ok', 'fake', 2, 1);
insert into core.discovery_candidates (id, org_id, url, host, site_kind, audiovisual, status, edital_id)
values
  ('70000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'https://orgao.example.gov.br/edital-cinema', 'orgao.example.gov.br', 'official', 'yes', 'imported', '20000000-0000-0000-0000-0000000000a1'),
  ('70000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'https://portal.example/edital-teatro', 'portal.example', 'unknown', 'no', 'suppressed', null),
  ('70000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'https://portal.example/chamada-x', 'portal.example', 'unknown', 'uncertain', 'uncertain', null);
select tests.throws(
  $$insert into core.discovery_candidates (org_id, url, host, site_kind, status) values ('10000000-0000-0000-0000-00000000000a', 'https://x.example/', 'x.example', 'unknown', 'aprovado')$$,
  'status do candidato só aceita valores conhecidos');
select tests.throws(
  $$insert into core.discovery_candidates (org_id, url, host, site_kind, status) values ('10000000-0000-0000-0000-00000000000a', 'javascript:alert(1)', 'x', 'unknown', 'failed')$$,
  'endereço do candidato precisa ser http(s)');
select tests.throws(
  $$insert into core.discovery_candidates (org_id, url, host, site_kind, status) values ('10000000-0000-0000-0000-00000000000a', 'https://orgao.example.gov.br/edital-cinema', 'orgao.example.gov.br', 'official', 'failed')$$,
  'o mesmo endereço não é registrado duas vezes na organização');

set local role authenticated;

-- viewer e editor: não veem a área técnica ------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok((select count(*) = 0 from core.discovery_candidates), 'Equipe não vê candidatos da descoberta');
select tests.ok((select count(*) = 0 from core.discovery_runs), 'Equipe não vê execuções da descoberta');
select tests.ok(
  tests.affected($$update core.edital_sources set is_favorite = true$$) = 0,
  'Equipe não marca favoritas');
select tests.ok(
  (select count(*) = 1 from core.editais where origin = 'web_discovery'),
  'Equipe vê o edital vindo da descoberta web (painel normal)');
select tests.login('00000000-0000-0000-0000-00000000000e');
select tests.ok((select count(*) = 0 from core.discovery_candidates), 'Diretoria não vê candidatos da descoberta');
select tests.ok(
  tests.affected($$update core.edital_sources set is_favorite = true$$) = 0,
  'Diretoria não marca favoritas');

-- admin -------------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000d');
select tests.ok((select count(*) = 3 from core.discovery_candidates), 'Administrador vê os candidatos');
select tests.ok((select count(*) = 1 from core.discovery_runs), 'Administrador vê as execuções');
select tests.ok(
  tests.affected($$update core.edital_sources set is_favorite = true where id = '30000000-0000-0000-0000-0000000000a1'$$) = 1,
  'Administrador marca a fonte como favorita ⭐');
select tests.ok(
  tests.affected($$update core.discovery_candidates set status = 'dismissed', status_reason = 'não é audiovisual' where id = '70000000-0000-0000-0000-0000000000a3'$$) = 1,
  'Administrador descarta um candidato incerto');
select tests.throws(
  $$update core.discovery_candidates set audiovisual = 'yes' where id = '70000000-0000-0000-0000-0000000000a2'$$,
  'a decisão audiovisual registrada não é editável pela tela');
select tests.throws(
  $$insert into core.discovery_candidates (org_id, url, host, site_kind, status) values ('10000000-0000-0000-0000-00000000000a', 'https://y.example/', 'y.example', 'unknown', 'failed')$$,
  'candidatos só são gravados pelo servidor');
select tests.throws(
  $$insert into core.discovery_runs (org_id, trigger, status) values ('10000000-0000-0000-0000-00000000000a', 'manual', 'ok')$$,
  'execuções só são gravadas pelo servidor');
select tests.ok(
  tests.affected($$delete from core.discovery_candidates where id = '70000000-0000-0000-0000-0000000000a2'$$) = 1,
  'Administrador pede reavaliação (apaga o registro técnico)');
select tests.ok(
  tests.affected($$insert into core.edital_sources (org_id, name, list_url, active, origin, is_favorite) values ('10000000-0000-0000-0000-00000000000a', 'Fonte descoberta', 'https://instituto.example/chamadas', false, 'web_discovery', false)$$) = 1,
  'Administrador cadastra fonte descoberta (pausada)');

-- outra organização ----------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-0000000000b0');
select tests.ok((select count(*) = 0 from core.discovery_candidates), 'outra organização não vê candidatos');
select tests.ok((select count(*) = 0 from core.discovery_runs), 'outra organização não vê execuções');
select tests.ok(
  tests.affected($$update core.discovery_candidates set status = 'dismissed'$$) = 0,
  'outra organização não altera candidatos');

reset role;
select tests.ok(
  (select edital_id is null from core.discovery_candidates where id = '70000000-0000-0000-0000-0000000000a1') = false,
  'candidato importado mantém o vínculo com o edital');
select tests.ok(
  (select count(*) >= 1 from core.audit_log where table_name = 'discovery_candidates'),
  'alterações de candidatos ficam na auditoria');

\echo 'Todos os testes da descoberta web passaram.'

rollback;
