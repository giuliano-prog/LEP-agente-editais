-- Dados iniciais para DESENVOLVIMENTO LOCAL (executado por `supabase db reset`).
-- Não contém usuários nem dados sigilosos. O primeiro administrador é criado com
-- `pnpm members:invite` (ver README).

insert into core.organizations (name, slug)
values ('LEP Filmes', 'lep-filmes')
on conflict (slug) do nothing;

-- Editais FICTÍCIOS para testar telas e Match localmente (não são editais reais).
insert into core.editais (
  org_id, title, agency, status, deadline, total_amount, max_amount_per_project, summary,
  eligibility_criteria, categories, required_documents, official_url, official_links,
  accepted_formats, accepted_genres, accepted_stages, min_budget, max_budget, review_status
)
select
  o.id,
  'Edital Exemplo — Produção de Longa-Metragem',
  'Instituição Fictícia de Fomento',
  'open',
  now() + interval '45 days',
  10000000,
  2000000,
  'Edital fictício para desenvolvimento local. Apoia a produção de longas-metragens de ficção e documentário em fase de produção.',
  array['Proponente deve ser produtora independente com registro na ANCINE', 'Sede no território do edital há pelo menos 1 ano'],
  array['Longa-metragem de ficção', 'Longa-metragem documental'],
  array['Certidão negativa de débitos federais', 'Roteiro completo', 'Orçamento detalhado'],
  'https://example.org/edital-exemplo',
  '[{"label": "Página do edital (exemplo)", "url": "https://example.org/edital-exemplo"}]'::jsonb,
  array['feature_film'],
  array['fiction', 'documentary'],
  array['pre_production', 'production'],
  500000,
  8000000,
  'validated'
from core.organizations o
where o.slug = 'lep-filmes'
  and not exists (select 1 from core.editais e where e.title = 'Edital Exemplo — Produção de Longa-Metragem');

insert into core.editais (org_id, title, agency, status, deadline, total_amount, summary, categories, accepted_formats, accepted_stages, review_status)
select
  o.id,
  'Chamada Exemplo — Desenvolvimento de Séries',
  'Fundo Fictício de Audiovisual',
  'open',
  now() + interval '5 days',
  3000000,
  'Chamada fictícia para desenvolvimento de projetos de séries. Dados ainda não revisados.',
  array['Série de ficção', 'Série de animação'],
  array['series'],
  array['development'],
  'pending'
from core.organizations o
where o.slug = 'lep-filmes'
  and not exists (select 1 from core.editais e where e.title = 'Chamada Exemplo — Desenvolvimento de Séries');

-- Sede da LEP (diretriz territorial). A migração já faz isso; repetido para bancos locais antigos.
update core.organizations set hq_state = 'SP', hq_city = 'São Paulo' where slug = 'lep-filmes' and hq_state is null;
