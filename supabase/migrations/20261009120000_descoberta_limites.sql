-- =====================================================================
-- Descoberta web: proteção de custo do provedor de busca (ADR-0024).
--
-- • core.search_api_usage: contador de chamadas à API de busca por organização e
--   mês (AAAA-MM no fuso America/Sao_Paulo).
-- • core.reserve_search_request(org, limite): RESERVA uma chamada de forma
--   atômica — incrementa o contador só se o total estiver abaixo do limite, numa
--   única instrução (INSERT … ON CONFLICT DO UPDATE … WHERE), e devolve se a
--   reserva foi aceita. Duas execuções simultâneas disputam a mesma linha: a
--   segunda espera a trava da primeira e reavalia o WHERE com o valor novo, então
--   o teto nunca é ultrapassado. Toda tentativa conta (inclusive novas tentativas
--   e chamadas que terminam em erro): a reserva é feita ANTES de chamar a API.
-- • core.discovery_runs.api_requests / limit_reached: chamadas feitas na
--   execução e qual limite interrompeu as buscas.
-- Uso só pelo servidor (chave de serviço). Administradores leem o contador.
-- Idempotente (ADR-0014).
-- =====================================================================

create table if not exists core.search_api_usage (
  org_id      uuid not null references core.organizations (id) on delete cascade,
  month       text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  requests    integer not null default 0 check (requests >= 0),
  updated_at  timestamptz not null default now(),
  primary key (org_id, month)
);

comment on table core.search_api_usage is 'Chamadas à API de busca da descoberta web por organização e mês (America/Sao_Paulo). Controle de custo.';

create or replace function core.reserve_search_request(p_org_id uuid, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_month text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_requests integer;
begin
  if p_org_id is null or p_limit is null or p_limit <= 0 then
    return false;
  end if;
  insert into core.search_api_usage as u (org_id, month, requests, updated_at)
  values (p_org_id, v_month, 1, now())
  on conflict (org_id, month) do update
    set requests = u.requests + 1, updated_at = now()
    where u.requests < p_limit
  returning u.requests into v_requests;
  return v_requests is not null;
end;
$$;

comment on function core.reserve_search_request(uuid, integer) is 'Reserva atômica de 1 chamada à API de busca no mês corrente; false quando o teto mensal foi atingido.';

revoke execute on function core.reserve_search_request(uuid, integer) from public, anon, authenticated;
grant execute on function core.reserve_search_request(uuid, integer) to service_role;

alter table core.search_api_usage enable row level security;

drop policy if exists "search_api_usage_select_admins" on core.search_api_usage;
create policy "search_api_usage_select_admins" on core.search_api_usage
  for select to authenticated using (core.has_role(org_id, 'admin'));

grant select on core.search_api_usage to authenticated;
grant all on core.search_api_usage to service_role;

alter table core.discovery_runs
  add column if not exists api_requests  integer not null default 0,
  add column if not exists limit_reached text;

alter table core.discovery_runs drop constraint if exists discovery_runs_limit_reached_check;
alter table core.discovery_runs
  add constraint discovery_runs_limit_reached_check check (
    limit_reached is null or limit_reached in ('per_run', 'per_month', 'raw_results', 'reservation_failed'));

comment on column core.discovery_runs.api_requests is 'Chamadas à API de busca feitas nesta execução (inclui novas tentativas e erros).';
comment on column core.discovery_runs.limit_reached is 'Limite que interrompeu as buscas: per_run | per_month | raw_results | reservation_failed.';
