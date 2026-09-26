-- Verifica o banco após aplicar todas as migrações sobre o cenário "remoto parcial".
\set ON_ERROR_STOP 1
\set QUIET 1
do $$
declare
  v_missing text;
begin
  select string_agg(t, ', ') into v_missing
  from unnest(array['organizations','profiles','memberships','audit_log','ai_usage','editais','projetos',
                    'edital_documents','edital_sources','monitor_runs']) t
  where to_regclass('core.' || t) is null;
  if v_missing is not null then raise exception 'FALHOU: tabelas ausentes: %', v_missing; end if;

  select string_agg(c, ', ') into v_missing
  from unnest(array['review_status','origin','source_id','discovered_at','eligible_territories','triage_reason',
                    'accepted_formats','org_id']) c
  where not exists (select 1 from information_schema.columns
                    where table_schema = 'core' and table_name = 'editais' and column_name = c);
  if v_missing is not null then raise exception 'FALHOU: colunas ausentes em core.editais: %', v_missing; end if;

  if (select format_type(atttypid, atttypmod) from pg_attribute
      where attrelid = 'core.edital_documents'::regclass and attname = 'edital_id') <> 'bigint' then
    raise exception 'FALHOU: edital_id deveria herdar bigint de core.editais.id';
  end if;
  if not exists (select 1 from core.editais where title = 'Edital cadastrado pelo painel' and org_id is not null and review_status = 'pending') then
    raise exception 'FALHOU: edital antigo não foi preservado/associado à organização';
  end if;
  if (select hq_state from core.organizations where slug = 'lep-filmes') is distinct from 'SP' then
    raise exception 'FALHOU: sede da LEP não definida';
  end if;
  if (select count(*) from pg_policies where schemaname = 'core') < 25 then
    raise exception 'FALHOU: políticas de acesso incompletas';
  end if;
  raise notice 'ok - cenário remoto parcial alinhado: tabelas, colunas, dados antigos, sede e políticas';
end;
$$;
\echo 'Cenário "remoto parcial" alinhado com sucesso.'
