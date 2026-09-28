-- =====================================================================
-- Membros: status do vínculo (etapa 3 das melhorias).
--
-- • core.memberships.status: invited | active | suspended.
--   Somente vínculos ATIVOS dão acesso: core.role_in_org (e, por consequência,
--   core.has_role e todo o RLS) passa a ignorar convidados e suspensos.
-- • Vínculos existentes continuam ativos (nada é apagado).
-- • Regras no banco (trigger core.guard_membership_status):
--   - usuário (admin) que cria vínculo pela API sempre cria como "convidado";
--   - "convidado → ativo" só acontece quando a PRÓPRIA pessoa entra
--     (core.accept_my_invitations) ou pelo servidor (chave de serviço);
--   - ninguém suspende o próprio vínculo;
--   - a organização mantém pelo menos um administrador ATIVO.
-- • A plataforma nunca pede nem guarda senhas: o convite é do Supabase Auth.
-- Idempotente (ADR-0014).
-- =====================================================================

alter table core.memberships
  add column if not exists status        text not null default 'active',
  add column if not exists invited_at    timestamptz,
  add column if not exists invited_by    uuid references core.profiles (id) on delete set null,
  add column if not exists accepted_at   timestamptz,
  add column if not exists suspended_at  timestamptz,
  add column if not exists suspended_by  uuid references core.profiles (id) on delete set null;

alter table core.memberships drop constraint if exists memberships_status_check;
alter table core.memberships
  add constraint memberships_status_check check (status in ('invited', 'active', 'suspended'));

-- Vínculos anteriores a esta migração já estavam em uso.
update core.memberships
set accepted_at = created_at
where status = 'active' and accepted_at is null;

create index if not exists memberships_org_status_idx on core.memberships (org_id, status);

comment on column core.memberships.status is 'invited (convite enviado) | active (acesso liberado) | suspended (acesso bloqueado). Só active dá acesso.';
comment on column core.memberships.accepted_at is 'Quando a pessoa entrou pela primeira vez (aceitou o convite).';

-- ---------------------------------------------------------------------
-- Acesso: apenas vínculos ativos
-- ---------------------------------------------------------------------
create or replace function core.role_in_org(p_org_id uuid)
returns core.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from core.memberships m
  where m.org_id = p_org_id
    and m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

comment on function core.role_in_org is 'Papel do usuário autenticado na organização (null se não for membro ATIVO).';

-- A pessoa sempre enxerga o próprio vínculo (para a tela explicar convite/suspensão).
drop policy if exists "memberships_select_self" on core.memberships;
create policy "memberships_select_self" on core.memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Pelo menos um administrador ATIVO
-- ---------------------------------------------------------------------
create or replace function core.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Exclusões em cascata (organização ou usuário removidos) não são bloqueadas.
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if old.role = 'admin'
     and coalesce(old.status, 'active') = 'active'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active')
     and not exists (
       select 1 from core.memberships m
       where m.org_id = old.org_id
         and m.role = 'admin'
         and m.status = 'active'
         and m.id <> old.id
     )
  then
    raise exception 'A organização precisa manter pelo menos um administrador ativo.'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

revoke execute on function core.prevent_last_admin_removal() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Transições de status
-- auth.uid() nulo = servidor (chave de serviço, scripts, migrações).
-- ---------------------------------------------------------------------
create or replace function core.guard_membership_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if v_actor is not null then
      -- Pela interface, todo vínculo novo nasce como convite.
      new.status := 'invited';
      new.invited_by := v_actor;
    end if;
    if new.status = 'invited' then
      new.invited_at := coalesce(new.invited_at, now());
      new.accepted_at := null;
    elsif new.status = 'active' then
      new.accepted_at := coalesce(new.accepted_at, now());
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'suspended' then
      if v_actor is not null and old.user_id = v_actor then
        raise exception 'Você não pode suspender o próprio acesso.'
          using errcode = 'check_violation';
      end if;
      new.suspended_at := now();
      new.suspended_by := v_actor;
    elsif new.status = 'active' then
      if old.status = 'invited' and v_actor is not null and v_actor <> old.user_id then
        raise exception 'O convite só é aceito pela própria pessoa, ao entrar na plataforma.'
          using errcode = 'check_violation';
      end if;
      if old.status = 'suspended' and old.accepted_at is null and v_actor is not null then
        raise exception 'Este convite nunca foi aceito: reative como convite.'
          using errcode = 'check_violation';
      end if;
      new.accepted_at := coalesce(old.accepted_at, now());
      new.suspended_at := null;
      new.suspended_by := null;
    elsif new.status = 'invited' then
      if old.accepted_at is not null then
        raise exception 'Quem já entrou na plataforma não volta a ser convite: reative o acesso.'
          using errcode = 'check_violation';
      end if;
      new.suspended_at := null;
      new.suspended_by := null;
    end if;
  end if;

  -- Datas e autores não são editáveis pela interface (grants: só role e status).
  return new;
end;
$$;

revoke execute on function core.guard_membership_status() from public, anon, authenticated;

drop trigger if exists memberships_guard_status on core.memberships;
create trigger memberships_guard_status
  before insert or update on core.memberships
  for each row execute function core.guard_membership_status();

-- ---------------------------------------------------------------------
-- Aceite do convite: a própria pessoa, já autenticada (link do convite ou login).
-- Não reativa vínculos suspensos.
-- ---------------------------------------------------------------------
create or replace function core.accept_my_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    return 0;
  end if;
  update core.memberships
  set status = 'active'
  where user_id = (select auth.uid())
    and status = 'invited';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function core.accept_my_invitations() from public, anon;
grant execute on function core.accept_my_invitations() to authenticated;

-- ---------------------------------------------------------------------
-- Privilégios: admin altera papel e status (as regras acima valem sempre).
-- ---------------------------------------------------------------------
grant update (role, status) on core.memberships to authenticated;
