# ADR-0011 — Cadastro de editais por URL/PDF

**Status:** Aceita (2026-09-26)

## Contexto

Etapa 2 do roadmap: registrar editais a partir da fonte oficial, guardando a cópia
original do documento, **sem IA** (a extração automática é a Etapa 3).

## Decisão

1. **Três entradas:** link (página oficial ou PDF), envio de PDF e cadastro manual (só o título).
   Em todos os casos o edital nasce com `review_status = 'pending'` e o formulário de revisão abre em seguida.
2. **Cópia original imutável** no Supabase Storage, bucket privado `edital-documents`
   (PDF e HTML, até 25 MB). Caminho: `<org_id>/<captures|uploads>/<uuid>.<ext>`.
   As políticas do Storage usam a primeira pasta (org) com `core.has_role`.
3. **`core.edital_documents`** registra cada documento (principal, anexo, retificação, FAQ, resultado)
   com **SHA-256**, URL de origem/final, status HTTP e metadados extraídos do HTML (título, links de PDF).
   O hash não pode ser alterado; nova versão = novo documento. `edital_id` herda o tipo de `core.editais.id`.
4. **Duplicidade:** antes de criar, procura documento com o mesmo hash ou edital com o mesmo link oficial
   na organização; se existir, o cadastro é recusado com link para o edital existente e a cópia é descartada.
5. **Criação atômica:** `core.create_edital_with_document` (SECURITY INVOKER) cria edital + documento
   na mesma transação, respeitando o RLS de quem chama.
6. **Download seguro de URLs (`@lep/ingestion`)** — proteção contra SSRF:
   só http/https nas portas 80/443, sem credenciais na URL, bloqueio de redes internas
   (IPv4/IPv6, incluindo metadados de nuvem) **validado no momento da conexão** (anti DNS rebinding),
   redirecionamentos revalidados (máx. 5), tempo máximo de 20 s e limite de 25 MB.
   Sites que exigem login não são acessados (ADR-0009).
7. **Upload de PDF direto do navegador para o Storage** (evita o limite de ~4,5 MB por requisição da Vercel).
   O servidor então baixa o arquivo, confere o caminho, o tamanho e a assinatura `%PDF`, calcula o hash e registra.
   Arquivos rejeitados são removidos.
8. **Páginas HTML capturadas nunca são exibidas** pela plataforma: o link temporário (60 s) força download.
9. **Formulário de revisão** com padrões brasileiros: valores "1.500.000,00", listas um item por linha,
   prazo em data/hora de Brasília (sem hora = 23h59). Só vira `validated` com a confirmação explícita
   "Revisei estas informações com o documento oficial".

## Consequências

- As variáveis `NEXT_PUBLIC_*` precisam existir **no momento do build** (o navegador as usa para o upload).
- A detecção de alterações/retificações automáticas (Etapa 7) poderá comparar hashes dos documentos já guardados.
