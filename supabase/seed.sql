-- Dados iniciais para DESENVOLVIMENTO LOCAL (executado por `supabase db reset`).
-- Não contém usuários nem dados sigilosos. O primeiro administrador é criado com
-- `pnpm bootstrap:admin` (ver README).

insert into core.organizations (name, slug)
values ('LEP Filmes', 'lep-filmes')
on conflict (slug) do nothing;
