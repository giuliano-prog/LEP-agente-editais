-- =====================================================================
-- Testes do classificador de páginas e da configuração por fonte (etapa 6).
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
  ('00000000-0000-0000-0000-0000000000b0', 'admin-b@teste.local');
insert into core.organizations (id, name, slug) values ('10000000-0000-0000-0000-00000000000a', 'Org A', 'org-a-teste'), ('10000000-0000-0000-0000-00000000000b', 'Org B', 'org-b-teste');
insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e', 'editor'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'viewer'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b0', 'admin');
insert into core.edital_sources (id, org_id, name, list_url) values
  ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Fonte A', 'https://a.exemplo.org/editais/');

select tests.ok(
  (select adapter_config = '{}'::jsonb from core.edital_sources where id = '40000000-0000-0000-0000-00000000000a'),
  'fontes existentes ficam com configuração padrão (vazia)');
select tests.throws(
  $$update core.edital_sources set adapter_config = '["lista"]' where id = '40000000-0000-0000-0000-00000000000a'$$,
  'configuração da fonte precisa ser um objeto JSON');

-- Servidor (varredura) registra página ignorada e edital classificado.
insert into core.monitor_ignored_urls (org_id, source_id, url, title, page_type, reasons) values
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'https://a.exemplo.org/editais/integridade/', 'Programa de Integridade',
   'institutional', array['página institucional (“integridade”)']);
select tests.throws(
  $$insert into core.monitor_ignored_urls (org_id, url, page_type) values ('10000000-0000-0000-0000-00000000000a', 'https://a.exemplo.org/editais/integridade/', 'news')$$,
  'mesma página não é registrada duas vezes');
select tests.throws(
  $$insert into core.monitor_ignored_urls (org_id, url, page_type) values ('10000000-0000-0000-0000-00000000000a', 'https://a.exemplo.org/x/', 'opportunity')$$,
  'oportunidade nunca vai para a lista de ignoradas');
insert into core.editais (id, org_id, title, origin, page_type, opportunity_kind, page_type_reasons) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Edital A', 'monitor', 'uncertain', 'award', array['valor em R$']);
select tests.throws(
  $$update core.editais set page_type = 'result' where id = '20000000-0000-0000-0000-0000000000a1'$$,
  'edital só pode ser oportunidade ou incerta');
select tests.throws(
  $$update core.editais set opportunity_kind = 'vaga' where id = '20000000-0000-0000-0000-0000000000a1'$$,
  'tipo de oportunidade só aceita os valores conhecidos');
insert into core.monitor_runs (org_id, source_id, trigger, status, ignored_pages) values
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'cron', 'ok', 1);

-- viewer ------------------------------------------------------------------
set local role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000f');
select tests.ok((select count(*) = 1 from core.monitor_ignored_urls), 'Equipe vê as páginas ignoradas (com motivo)');
select tests.ok(
  tests.affected($$delete from core.monitor_ignored_urls$$) = 0,
  'Equipe não pede reavaliação');
select tests.throws(
  $$insert into core.monitor_ignored_urls (org_id, url, page_type) values ('10000000-0000-0000-0000-00000000000a', 'https://a.exemplo.org/y/', 'news')$$,
  'usuários não gravam páginas ignoradas (só o servidor)');

-- editor ------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000e');
select tests.ok(
  tests.affected($$update core.edital_sources set adapter_config = '{"maxImports": 3}'$$) = 0,
  'Diretoria (editor) não configura fontes');

-- admin da outra organização ------------------------------------------------
select tests.login('00000000-0000-0000-0000-0000000000b0');
select tests.ok((select count(*) = 0 from core.monitor_ignored_urls), 'outra organização não vê as páginas ignoradas');
select tests.ok(
  tests.affected($$delete from core.monitor_ignored_urls$$) = 0,
  'outra organização não apaga');

-- admin -------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.ok(
  tests.affected($$update core.edital_sources set adapter_config = '{"linkExcludes": ["/resultado"], "maxImports": 3}'
                   where id = '40000000-0000-0000-0000-00000000000a'$$) = 1,
  'administrador configura a fonte');
select tests.ok(
  tests.affected($$delete from core.monitor_ignored_urls$$) = 1,
  'administrador pede reavaliação (apaga o registro)');
select tests.ok((select ignored_pages = 1 from core.monitor_runs), 'histórico registra páginas ignoradas');

reset role;

\echo 'Todos os testes do classificador de páginas passaram.'

rollback;
