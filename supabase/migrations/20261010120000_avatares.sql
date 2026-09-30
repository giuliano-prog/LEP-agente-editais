-- =====================================================================
-- Foto de perfil (avatar) dos membros.
--
-- • core.profiles.avatar_path: caminho do arquivo no bucket privado `avatars`
--   (`<user_id>/<arquivo>`). Nada de imagem em base64 no banco.
-- • Bucket `avatars` PRIVADO (2 MB; JPEG, PNG ou WebP). A tela usa URLs assinadas.
-- • Leitura: a própria pessoa e quem é membro ATIVO de uma organização em comum.
-- • Escrita pela sessão: só na própria pasta (`<auth.uid()>/...`). O ADM grava a foto
--   de outro membro pelo servidor (chave de serviço, ADR-0015), depois de conferir o papel.
-- • Senhas nunca passam por aqui: ficam só no Supabase Auth.
-- Idempotente (ADR-0014).
-- =====================================================================

alter table core.profiles
  add column if not exists avatar_path text;

alter table core.profiles drop constraint if exists profiles_avatar_path_check;
alter table core.profiles
  add constraint profiles_avatar_path_check check (
    avatar_path is null
    or (char_length(avatar_path) <= 300 and avatar_path like id::text || '/%')
  );

comment on column core.profiles.avatar_path is 'Foto de perfil: caminho no bucket privado avatars (<user_id>/<arquivo>). Nulo = iniciais.';

-- A própria pessoa altera nome e foto (RLS profiles_update_self já restringe à própria linha).
grant update (full_name, avatar_path) on core.profiles to authenticated;

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Pessoas que compartilham ao menos uma organização (vínculo ativo de quem lê).
create or replace function core.shares_org_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user = (select auth.uid())
    or exists (
      select 1 from core.memberships m
      where m.user_id = p_user
        and core.has_role(m.org_id, 'viewer')
    );
$$;

revoke execute on function core.shares_org_with(uuid) from public, anon;
grant execute on function core.shares_org_with(uuid) to authenticated, service_role;

drop policy if exists "avatars_storage_select" on storage.objects;
create policy "avatars_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and core.shares_org_with(core.try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists "avatars_storage_insert" on storage.objects;
create policy "avatars_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_storage_update" on storage.objects;
create policy "avatars_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_storage_delete" on storage.objects;
create policy "avatars_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
