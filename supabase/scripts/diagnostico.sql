-- =====================================================================
-- Diagnóstico da plataforma LEP — SOMENTE LEITURA (não altera nada).
-- Cole no SQL Editor do Supabase e execute. Cada bloco mostra um resultado.
-- =====================================================================

-- 1. Migrações aplicadas (compare com supabase/migrations/)
select version, name from supabase_migrations.schema_migrations order by version;

-- 2. Schemas expostos na API (deve conter "core")
select coalesce(
  (select string_agg(c, ', ') from pg_roles r, unnest(r.rolconfig) c
   where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%'),
  'padrão do painel — confira em Project Settings → Data API → Exposed schemas'
) as schemas_expostos;

-- 3. Tabelas do schema core
select table_name from information_schema.tables where table_schema = 'core' order by table_name;

-- 4. Políticas de acesso (as esperadas começam com o nome da tabela; revise as demais)
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'core' order by tablename, policyname;

-- 5. Usuários e papéis (quem não aparece aqui vê "Acesso ainda não liberado")
select u.email, o.name as organizacao, m.role
from auth.users u
left join core.memberships m on m.user_id = u.id
left join core.organizations o on o.id = m.org_id
order by u.email;

-- 6. Editais sem organização (ficam invisíveis para todos por causa do RLS)
select count(*) as editais_sem_organizacao from core.editais where org_id is null;

-- 7. Bucket de documentos
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'edital-documents';
