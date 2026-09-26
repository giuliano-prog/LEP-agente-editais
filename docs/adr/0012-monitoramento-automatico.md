# ADR-0012 — Monitoramento automático de fontes (varredura diária)

**Status:** Aceita (2026-09-26)

## Contexto

A LEP precisa descobrir editais novos sem depender só do cadastro manual. O fornecedor de IA
ainda não foi escolhido (ADR-0006), e nenhum edital pode ser considerado validado sem revisão humana (ADR-0009).

## Decisão

1. **Fontes** (`core.edital_sources`): página pública de listagem de editais de cada órgão, cadastrada por
   administradores. Opções: "fonte exclusiva de audiovisual" e filtro de endereço (`link_contains`).
2. **Agendamento:** Vercel Cron diário às 10:00 UTC (7h de Brasília) chama `/api/cron/monitor`
   (ver `apps/web/vercel.json`), autenticado por `Authorization: Bearer <CRON_SECRET>` (comparação em tempo constante).
   Administradores também podem rodar "Verificar agora".
3. **Worker:** a decisão adiada no ADR-0002 fica resolvida por ora com funções da Vercel (limite de ~60 s):
   até 5 importações por fonte e orçamento de 50 s por execução; as fontes menos recentes rodam primeiro.
4. **Chave de serviço no servidor web:** a varredura roda sem usuário logado, então usa `SUPABASE_SECRET_KEY`
   (`lib/supabase/admin.ts`), restrita ao motor da varredura, ao cron e ao Diagnóstico. Toda escrita é filtrada por `org_id`.
5. **Descoberta sem IA:** links da listagem que parecem editais (termos como edital, chamada, seleção, prêmio…) e,
   em fontes gerais, com termos de audiovisual; ruído (resultado, errata, "saiba mais"…) é ignorado.
   Links já conhecidos (link oficial ou documento guardado) não são reimportados.
6. **Importação:** cópia da página guardada (mesmo pipeline do ADR-0011) e edital criado com
   `origin = 'monitor'` e **revisão pendente**. Prazo, valor total, status e resumo são **sugeridos por regras de texto**
   (ex.: maior data perto de "inscrições"; maior valor em R$ perto de "valor total") e precisam ser conferidos na revisão.
7. **Triagem:** "Descartar" usa `review_status = 'discarded'` — some da lista principal e não volta a ser importado.
8. **Boa conduta:** respeita `robots.txt` (RFC 9309), identifica-se no User-Agent, não acessa sites com login,
   usa o download seguro anti-SSRF (ADR-0011).
9. **Histórico:** `core.monitor_runs` guarda cada varredura por fonte (links, candidatos, importados, erros).
10. **Diagnóstico:** página `/configuracoes/diagnostico` (admin) e `supabase/scripts/diagnostico.sql` (somente leitura);
    erros do banco são traduzidos em causa + correção (`lib/supabase/errors.ts`).

## Consequências

- Sites que mudam de estrutura podem gerar ruído ou deixar de ser lidos: o status de cada fonte fica visível e o
  filtro de endereço permite ajuste fino. Quando houver IA (Etapa 3), a triagem e a extração podem ser refinadas.
- Variáveis na Vercel: `SUPABASE_SECRET_KEY` e `CRON_SECRET`.
