-- =====================================================================
-- Testes da foto de perfil: coluna profiles.avatar_path e bucket privado `avatars`.
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
  ('00000000-0000-0000-0000-00000000001a', 'admin@teste.local'),
  ('00000000-0000-0000-0000-00000000001e', 'equipe@teste.local'),
  ('00000000-0000-0000-0000-0000000001b0', 'outra-org@teste.local');
insert into core.organizations (id, name, slug) values
  ('10000000-0000-0000-0000-00000000001a', 'Org A', 'org-a-avatar'),
  ('10000000-0000-0000-0000-00000000001b', 'Org B', 'org-b-avatar');
insert into core.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-00000000001a', 'admin'),
  ('10000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-00000000001e', 'viewer'),
  ('10000000-0000-0000-0000-00000000001b', '00000000-0000-0000-0000-0000000001b0', 'admin');

select tests.ok(
  (select public = false and file_size_limit = 2097152
     and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
   from storage.buckets where id = 'avatars'),
  'bucket avatars é privado, 2 MB, só JPEG/PNG/WebP');

-- Servidor grava as fotos (como o ADM faria pela chave de serviço).
insert into storage.objects (bucket_id, name) values
  ('avatars', '00000000-0000-0000-0000-00000000001e/foto.png'),
  ('avatars', '00000000-0000-0000-0000-0000000001b0/foto.png');

set local role authenticated;

-- Equipe (viewer): próprio nome e foto --------------------------------------
select tests.login('00000000-0000-0000-0000-00000000001e');
select tests.ok(
  tests.affected($$update core.profiles set full_name = 'Pessoa Equipe', avatar_path = '00000000-0000-0000-0000-00000000001e/nova.webp' where id = '00000000-0000-0000-0000-00000000001e'$$) = 1,
  'membro altera o próprio nome e foto');
select tests.ok(
  tests.affected($$update core.profiles set full_name = 'Invasão' where id = '00000000-0000-0000-0000-00000000001a'$$) = 0,
  'membro não altera o perfil de outra pessoa');
select tests.throws(
  $$update core.profiles set avatar_path = '00000000-0000-0000-0000-00000000001a/x.png' where id = '00000000-0000-0000-0000-00000000001e'$$,
  'caminho da foto precisa estar na pasta da própria pessoa');
select tests.throws(
  $$update core.profiles set email = 'x@teste.local' where id = '00000000-0000-0000-0000-00000000001e'$$,
  'e-mail não é alterável pela sessão');
select tests.ok(
  tests.affected($$update core.memberships set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000001e'$$) = 0,
  'membro não altera o próprio perfil de acesso (papel)');

insert into storage.objects (bucket_id, name) values
  ('avatars', '00000000-0000-0000-0000-00000000001e/nova.webp');
select tests.ok(true, 'membro envia foto para a própria pasta');
select tests.throws(
  $$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000001a/intrusa.png')$$,
  'membro não envia foto para a pasta de outra pessoa');
select tests.ok(
  tests.affected($$delete from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-0000-0000-0000000001b0/%'$$) = 0,
  'membro não apaga a foto de outra pessoa');
select tests.ok(
  (select count(*) = 2 from storage.objects where bucket_id = 'avatars'),
  'vê só as fotos da própria organização (própria: 2 arquivos)');

-- ADM da mesma organização vê a foto do membro; outra organização não ------
select tests.login('00000000-0000-0000-0000-00000000001a');
select tests.ok(
  (select count(*) = 2 from storage.objects where bucket_id = 'avatars'
     and name like '00000000-0000-0000-0000-00000000001e/%'),
  'ADM vê as fotos de quem está na mesma organização');
select tests.ok(
  tests.affected($$update core.profiles set full_name = 'Pelo ADM' where id = '00000000-0000-0000-0000-00000000001e'$$) = 0,
  'pela sessão, nem o ADM altera o perfil de outra pessoa (só pelo servidor)');

select tests.login('00000000-0000-0000-0000-0000000001b0');
select tests.ok(
  (select count(*) = 1 from storage.objects where bucket_id = 'avatars'),
  'outra organização não vê as fotos da Org A');

\echo 'Todos os testes de foto de perfil passaram.'

rollback;
