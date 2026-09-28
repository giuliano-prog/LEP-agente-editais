-- =====================================================================
-- Match v2 persistido (etapa 9 das melhorias).
--
-- core.edital_matches: o último cálculo de aderência de cada par edital × projeto,
-- com versão das regras, pontuação, confiança, nível, fatores (peso, situação,
-- motivo) e impedimentos. inputs_hash identifica os dados usados no cálculo.
-- Recalculado quando o edital, o projeto ou a varredura mudam. O histórico de
-- mudanças fica na auditoria. Nunca é previsão de aprovação (MATCH_DISCLAIMER).
-- edital_id usa o tipo de core.editais.id (uuid localmente; pode ser bigint remoto).
-- Idempotente (ADR-0014).
-- =====================================================================

do $$
declare
  v_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_id_type
  from pg_attribute a
  where a.attrelid = 'core.editais'::regclass and a.attname = 'id' and not a.attisdropped;

  execute format($ddl$
    create table if not exists core.edital_matches (
      id           uuid primary key default gen_random_uuid(),
      org_id       uuid not null references core.organizations (id) on delete cascade,
      edital_id    %s not null references core.editais (id) on delete cascade,
      projeto_id   uuid not null references core.projetos (id) on delete cascade,
      version      text not null check (version ~ '^v[0-9]+$'),
      score        numeric(5, 1) check (score is null or (score >= 0 and score <= 100)),
      confidence   numeric(4, 3) not null check (confidence >= 0 and confidence <= 1),
      level        text not null check (level in ('high', 'medium', 'low', 'insufficient')),
      verdict      text not null check (verdict in ('compatible', 'compatible_with_pending', 'incompatible')),
      factors      jsonb not null default '[]'::jsonb check (jsonb_typeof(factors) = 'array'),
      blockers     text[] not null default '{}',
      inputs_hash  text not null check (inputs_hash ~ '^[0-9a-f]{64}$'),
      computed_at  timestamptz not null default now(),
      unique (edital_id, projeto_id)
    )
  $ddl$, v_id_type);
end;
$$;

create index if not exists edital_matches_org_idx on core.edital_matches (org_id, level, score desc);

comment on table core.edital_matches is 'Último Match (aderência) calculado por edital × projeto. Compatibilidade técnica, nunca previsão de aprovação.';
comment on column core.edital_matches.factors is 'Fatores: [{key, label, weight, state: met|partial|unmet|unknown, detail}].';
comment on column core.edital_matches.inputs_hash is 'SHA-256 dos dados do edital e do projeto usados no cálculo.';

drop trigger if exists edital_matches_audit on core.edital_matches;
create trigger edital_matches_audit
  after insert or update or delete on core.edital_matches
  for each row execute function core.audit_row_change();

alter table core.edital_matches enable row level security;

-- O projeto precisa ser da mesma organização do Match.
drop policy if exists "edital_matches_select_members" on core.edital_matches;
create policy "edital_matches_select_members" on core.edital_matches
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "edital_matches_insert_editors" on core.edital_matches;
create policy "edital_matches_insert_editors" on core.edital_matches
  for insert to authenticated
  with check (
    core.has_role(org_id, 'editor')
    and exists (select 1 from core.projetos p where p.id = projeto_id and p.org_id = edital_matches.org_id)
    and exists (select 1 from core.editais e where e.id = edital_id and e.org_id = edital_matches.org_id)
  );
drop policy if exists "edital_matches_update_editors" on core.edital_matches;
create policy "edital_matches_update_editors" on core.edital_matches
  for update to authenticated
  using (core.has_role(org_id, 'editor'))
  with check (core.has_role(org_id, 'editor'));

grant select on core.edital_matches to authenticated;
grant insert (org_id, edital_id, projeto_id, version, score, confidence, level, verdict, factors, blockers, inputs_hash, computed_at)
  on core.edital_matches to authenticated;
grant update (version, score, confidence, level, verdict, factors, blockers, inputs_hash, computed_at)
  on core.edital_matches to authenticated;
grant all on core.edital_matches to service_role;
