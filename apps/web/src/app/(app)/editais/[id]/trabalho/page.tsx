import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@lep/core";
import {
  assessWorkspace,
  ELIGIBILITY_LABELS,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS,
  ITEM_REQUIREMENT_LABELS,
  ITEM_REQUIREMENTS,
  MATCH_DISCLAIMER,
  matchProject,
  parseWorkspaceRules,
  toEdital,
  toOrgDocument,
  toWorkspaceItem,
  VERDICT_LABELS,
  WORKSPACE_STATUS_LABELS,
  WORKSPACE_STATUSES,
  isWorkspaceStatus,
  type Finding,
  type ItemCategory,
  type WorkspaceItem,
} from "@lep/funding";
import { labelOf, PROJECT_FORMATS, PROJECT_GENRES, PROJECT_STAGES } from "@lep/projects";
import { DbErrorNotice } from "@/components/db-error-notice";
import { Deadline, EditalStatusBadge, EligibilityBadge } from "@/components/edital-badges";
import { Badge, type BadgeTone } from "@/components/ui";
import { ItemRow, type Member } from "@/components/workspace/item-row";
import { S } from "@/components/workspace/styles";
import { TextDraft } from "@/components/workspace/text-draft";
import { requireMembership } from "@/lib/auth/session";
import { formatBRL, formatDate, toMoneyInput } from "@/lib/format";
import { loadProponent } from "@/lib/proponent";
import { createClient } from "@/lib/supabase/server";
import {
  addItem,
  createWorkspace,
  deleteWorkspace,
  regenerateChecklist,
  saveItem,
  saveWorkspace,
} from "./actions";

export const metadata: Metadata = { title: "Área de Trabalho do Edital" };

const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

const SECTIONS = [
  ["prontidao", "Prontidão"],
  ["resumo", "Resumo"],
  ["producao", "Produção"],
  ["checklist", "Checklist"],
  ["documentos", "Documentos"],
  ["pendencias", "Pendências"],
  ["textos", "Textos"],
  ["orcamento", "Orçamento"],
  ["equipe", "Equipe"],
  ["direitos", "Direitos"],
  ["criterios", "Critérios"],
  ["inconsistencias", "Inconsistências"],
  ["acoes", "Próximas ações"],
] as const;

const SEVERITY: Record<Finding["severity"], { label: string; tone: BadgeTone }> = {
  blocker: { label: "Impedimento", tone: "bad" },
  error: { label: "Corrigir", tone: "bad" },
  warning: { label: "Atenção", tone: "warn" },
  info: { label: "Lembrete", tone: "neutral" },
};

const READINESS_TONES: Record<string, BadgeTone> = {
  blocked: "bad",
  not_started: "neutral",
  in_progress: "warn",
  almost: "brand",
  ready: "ok",
};

const ANSWER_TONES = {
  ok: "border-ok/30",
  warn: "border-warn/40",
  bad: "border-bad/40",
  neutral: "border-line",
} as const;

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string; aviso?: string }>;
}) {
  const [{ id }, flash] = await Promise.all([params, searchParams]);
  if (!ID_PATTERN.test(id)) notFound();

  const { membership } = await requireMembership();
  const canEdit = can(membership.role, "content.edit");
  const isAdmin = can(membership.role, "org.manage");
  const supabase = await createClient();

  const [
    editalQuery,
    workspaceQuery,
    projectsQuery,
    membersQuery,
    documentsQuery,
    changesQuery,
    editalDocs,
    proponent,
  ] = await Promise.all([
    supabase.from("editais").select("*").eq("id", id).eq("org_id", membership.orgId).maybeSingle(),
    supabase
      .from("edital_workspaces")
      .select("*")
      .eq("edital_id", id)
      .eq("org_id", membership.orgId)
      .maybeSingle(),
    supabase
      .from("projetos")
      .select("id, title, format, genre, stage, budget")
      .eq("org_id", membership.orgId)
      .order("title", { ascending: true }),
    supabase
      .from("memberships")
      .select("user_id, profiles!memberships_user_id_fkey ( id, full_name, email )")
      .eq("org_id", membership.orgId)
      .eq("status", "active"),
    supabase
      .from("org_documents")
      .select("*")
      .eq("org_id", membership.orgId)
      .order("title", { ascending: true }),
    supabase
      .from("edital_changes")
      .select("id", { count: "exact", head: true })
      .eq("edital_id", id)
      .eq("org_id", membership.orgId)
      .eq("status", "pending"),
    supabase
      .from("edital_documents")
      .select("created_at")
      .eq("edital_id", id)
      .eq("org_id", membership.orgId)
      .order("created_at", { ascending: false })
      .limit(1),
    loadProponent(supabase, membership.orgId),
  ]);

  if (!editalQuery.data) notFound();
  const edital = toEdital(editalQuery.data);
  const workspaceRow = workspaceQuery.data;
  const projects = projectsQuery.data ?? [];
  const members: Member[] = (membersQuery.data ?? [])
    .map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return profile
        ? { id: profile.id, name: profile.full_name ?? profile.email ?? "Membro" }
        : null;
    })
    .filter((member): member is Member => member !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const documents = (documentsQuery.data ?? []).map((row) => toOrgDocument(row));

  const flashes = (
    <>
      {flash.ok && <Notice tone="ok">{flash.ok}</Notice>}
      {flash.aviso && <Notice tone="warn">{flash.aviso}</Notice>}
      {flash.erro && <Notice tone="bad">{flash.erro}</Notice>}
    </>
  );

  const header = (
    <header className="space-y-3">
      <Link
        href={`/editais/${edital.id}`}
        className="inline-block text-sm text-muted hover:text-brand"
      >
        ← Voltar ao edital
      </Link>
      <p className={S.eyebrow}>Área de Trabalho do Edital</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{edital.title}</h1>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <EditalStatusBadge status={edital.status} />
        <EligibilityBadge status={edital.eligibilityStatus} />
        {edital.agency && <span className="text-muted">{edital.agency}</span>}
        <span className="text-muted">
          · Prazo: <Deadline value={edital.deadline} />
        </span>
      </div>
    </header>
  );

  if (!workspaceRow) {
    return (
      <div className="space-y-6">
        {header}
        {flashes}
        <DbErrorNotice
          error={workspaceQuery.error}
          isAdmin={isAdmin}
          context="a área de trabalho"
        />
        <section className={`${S.card} space-y-4 p-6`}>
          <h2 className="text-lg font-semibold">Preparar a inscrição neste edital</h2>
          <p className="max-w-2xl text-sm text-muted">
            A Área de Trabalho lê o regulamento guardado e monta o checklist da inscrição —
            documentos, textos com limite, orçamento, equipe, direitos e critérios — e cruza com a
            produção escolhida, o acervo de documentos da LEP e o Match. Tudo por regras
            verificáveis, com o trecho do edital.
          </p>
          {workspaceQuery.error ? null : canEdit ? (
            <form action={createWorkspace.bind(null, edital.id)}>
              <button className={S.primary}>Criar Área de Trabalho</button>
            </form>
          ) : (
            <p className="text-sm text-muted">
              Ainda não iniciada. A Diretoria ou o ADM podem criar a área de trabalho deste edital.
            </p>
          )}
        </section>
      </div>
    );
  }

  const items = await supabase
    .from("edital_workspace_items")
    .select("*")
    .eq("workspace_id", workspaceRow.id)
    .eq("org_id", membership.orgId)
    .order("position", { ascending: true });
  const allItems: WorkspaceItem[] = (items.data ?? []).map((row) => toWorkspaceItem(row));
  const rules = parseWorkspaceRules(workspaceRow.rules);
  const production = projects.find((project) => project.id === workspaceRow.projeto_id) ?? null;
  const now = new Date();
  const match = production ? matchProject(edital, production, now, proponent) : null;
  const status = isWorkspaceStatus(workspaceRow.status) ? workspaceRow.status : "preparing";

  const assessment = assessWorkspace({
    edital,
    workspace: {
      projetoId: workspaceRow.projeto_id ?? null,
      status,
      requestedAmount: amount(workspaceRow.requested_amount),
      totalBudget: amount(workspaceRow.total_budget),
      counterpartAmount: amount(workspaceRow.counterpart_amount),
      rules,
      rulesExtractedAt: workspaceRow.rules_extracted_at ?? null,
    },
    items: allItems,
    production,
    match,
    documents,
    pendingChanges: changesQuery.count ?? 0,
    latestEditalDocumentAt: editalDocs.data?.[0]?.created_at ?? null,
    now,
  });

  const byCategory = (categories: ItemCategory[]) =>
    allItems.filter((item) => categories.includes(item.category));
  const rowProps = { editalId: edital.id, canEdit, members, documents };
  const { readiness } = assessment;
  const criteriaTotal = rules.criteria.reduce((sum, criterion) => sum + (criterion.points ?? 0), 0);

  return (
    <div className="space-y-8">
      {header}
      {flashes}

      {/* 13. Status geral de prontidão + próximas ações (topo) */}
      <section
        id="prontidao"
        aria-labelledby="prontidao-titulo"
        className="grid scroll-mt-24 gap-4 lg:grid-cols-3"
      >
        <div className={`${S.card} space-y-4 p-5`}>
          <h2 id="prontidao-titulo" className={S.eyebrow}>
            Status geral de prontidão
          </h2>
          <div className="flex items-end justify-between gap-3">
            <p className="text-5xl font-semibold tabular-nums text-brand">{readiness.percent}%</p>
            <Badge tone={READINESS_TONES[readiness.level]}>{readiness.label}</Badge>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-card-raised"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={readiness.percent}
            aria-label="Itens obrigatórios concluídos"
          >
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${readiness.percent}%` }}
            />
          </div>
          <p className="text-sm text-muted">
            {readiness.mandatoryDone} de {readiness.mandatoryTotal} itens obrigatórios concluídos
            {assessment.daysLeft !== null &&
              assessment.daysLeft >= 0 &&
              ` · ${assessment.daysLeft} dia(s) até o prazo`}
            .
          </p>
          <p className="text-xs text-muted">
            {assessment.findings.filter((finding) => finding.severity === "blocker").length}{" "}
            impedimento(s) ·{" "}
            {assessment.findings.filter((finding) => finding.severity === "error").length}{" "}
            correção(ões) ·{" "}
            {assessment.findings.filter((finding) => finding.severity === "warning").length}{" "}
            ponto(s) de atenção
          </p>
          {canEdit ? (
            <form
              action={saveWorkspace.bind(null, edital.id)}
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="anchor" value="prontidao" />
              <label className={`${S.label} min-w-0 flex-1`}>
                <span className="text-xs text-muted">Situação da inscrição</span>
                <select name="status" defaultValue={status} className={S.control}>
                  {WORKSPACE_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {WORKSPACE_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <button className={S.secondary}>Salvar</button>
            </form>
          ) : (
            <p className="text-sm">Situação: {WORKSPACE_STATUS_LABELS[status]}</p>
          )}
        </div>

        <div className={`${S.card} space-y-3 p-5 lg:col-span-2`}>
          <h2 className={S.eyebrow}>Próxima ação mais importante</h2>
          {assessment.nextActions[0] ? (
            <a
              href={`#${assessment.nextActions[0].itemId ? `item-${assessment.nextActions[0].itemId}` : assessment.nextActions[0].section}`}
              className="block rounded-lg border border-brand/40 bg-brand/10 p-4 hover:border-brand"
            >
              <span className="block font-semibold text-brand">
                {assessment.nextActions[0].title}
              </span>
              {assessment.nextActions[0].detail && (
                <span className="mt-1 block text-sm text-muted">
                  {assessment.nextActions[0].detail}
                </span>
              )}
            </a>
          ) : (
            <p className="rounded-lg border border-ok/40 bg-ok/10 p-4 text-sm text-ok">
              Nada pendente pelas regras: revise o material e envie a inscrição.
            </p>
          )}
          <h3 className={`${S.eyebrow} pt-2`}>Respostas rápidas</h3>
          <dl className="grid gap-2 sm:grid-cols-2">
            {assessment.answers.map((answer) => (
              <div
                key={answer.question}
                className={`rounded-lg border bg-card-raised/40 p-3 ${ANSWER_TONES[answer.tone]}`}
              >
                <dt className="text-xs text-muted">{answer.question}</dt>
                <dd className="mt-1 text-sm">{answer.answer}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">{MATCH_DISCLAIMER}</p>
        </div>
      </section>

      <nav aria-label="Seções da área de trabalho" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex min-w-max gap-1.5 text-sm">
          {SECTIONS.map(([anchor, label]) => (
            <li key={anchor}>
              <a
                href={`#${anchor}`}
                className="block rounded-full border border-line px-3 py-1 text-muted hover:border-brand hover:text-brand"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* 1. Resumo do edital */}
      <Section id="resumo" title="Resumo do edital">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Prazo final">
            <Deadline value={edital.deadline} />
          </Fact>
          <Fact label="Valor máximo por projeto">{formatBRL(edital.maxAmountPerProject)}</Fact>
          <Fact label="Valor total">{formatBRL(edital.totalAmount)}</Fact>
          <Fact label="Elegibilidade da LEP">{ELIGIBILITY_LABELS[edital.eligibilityStatus]}</Fact>
        </div>
        <div className={`${S.card} space-y-3 p-5 text-sm`}>
          <p className="whitespace-pre-line leading-relaxed">
            {edital.summary ?? "Resumo ainda não cadastrado."}
          </p>
          <p className="text-xs text-muted">
            Regras lidas{" "}
            {workspaceRow.rules_extracted_at
              ? `em ${new Date(workspaceRow.rules_extracted_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} — ${workspaceRow.rules_source === "fields" ? "a partir do cadastro (sem documento legível)" : "dos documentos guardados do edital"}`
              : "ainda não"}
            . Confira sempre o regulamento oficial.{" "}
            <Link href={`/editais/${edital.id}`} className="text-brand hover:underline">
              Dados e evidências
            </Link>{" "}
            ·{" "}
            <Link
              href={`/editais/${edital.id}?aba=documentos`}
              className="text-brand hover:underline"
            >
              Documentos do edital
            </Link>{" "}
            ·{" "}
            <Link
              href={`/editais/${edital.id}?aba=historico`}
              className="text-brand hover:underline"
            >
              Histórico
            </Link>
          </p>
        </div>
      </Section>

      {/* 2. Produção relacionada */}
      <Section id="producao" title="Produção relacionada">
        <div className={`${S.card} space-y-4 p-5`}>
          {canEdit ? (
            <form
              action={saveWorkspace.bind(null, edital.id)}
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="anchor" value="producao" />
              <label className={`${S.label} min-w-60 flex-1`}>
                <span className="font-medium">Produção que será inscrita</span>
                <select
                  name="projeto_id"
                  defaultValue={workspaceRow.projeto_id ?? ""}
                  className={S.control}
                >
                  <option value="">Nenhuma produção vinculada</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
              <button className={S.secondary}>Vincular</button>
            </form>
          ) : null}
          {production ? (
            <div className="space-y-3 text-sm">
              <p>
                <Link href={`/projetos/${production.id}`} className="font-medium hover:text-brand">
                  {production.title}
                </Link>{" "}
                <span className="text-muted">
                  · {labelOf(PROJECT_FORMATS, production.format)}
                  {production.genre && ` · ${labelOf(PROJECT_GENRES, production.genre)}`} ·{" "}
                  {labelOf(PROJECT_STAGES, production.stage)} · orçamento cadastrado{" "}
                  {formatBRL(production.budget)}
                </span>
              </p>
              {match && (
                <div className="space-y-2">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        match.verdict === "compatible"
                          ? "ok"
                          : match.verdict === "incompatible"
                            ? "bad"
                            : "warn"
                      }
                    >
                      {VERDICT_LABELS[match.verdict]}
                    </Badge>
                    {match.score !== null && (
                      <span className="text-muted">Aderência {match.score}/100</span>
                    )}
                  </p>
                  {[...match.unmet, ...match.attention].length > 0 && (
                    <ul className="space-y-1 text-muted">
                      {[...match.unmet, ...match.attention].map((entry) => (
                        <li key={`${entry.criterion}-${entry.detail}`}>
                          <span className="text-fg">{entry.criterion}:</span> {entry.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">
              {projects.length === 0
                ? "Nenhuma produção cadastrada em Produções. Cadastre a produção para cruzar formato, estágio e orçamento."
                : "Escolha a produção para cruzar formato, gênero, estágio e orçamento com o edital (Match)."}
            </p>
          )}
        </div>
      </Section>

      {/* 3. Checklist da inscrição */}
      <Section
        id="checklist"
        title="Checklist da inscrição"
        aside={
          canEdit && (
            <form action={regenerateChecklist.bind(null, edital.id)}>
              <button className={S.secondary}>Atualizar checklist do edital</button>
            </form>
          )
        }
      >
        <p className="text-sm text-muted">
          Itens gerados a partir do edital (com o trecho) e itens adicionados pela equipe. Atualizar
          o checklist só acrescenta o que é novo — nada do que foi feito é apagado.
        </p>
        {allItems.length === 0 ? (
          <Empty>Checklist vazio. Use “Atualizar checklist do edital” ou adicione itens.</Empty>
        ) : (
          <div className="space-y-4">
            {ITEM_CATEGORIES.map((category) => {
              const list = allItems.filter((item) => item.category === category);
              if (list.length === 0) return null;
              const done = list.filter(
                (item) => item.status === "done" || item.status === "not_applicable",
              ).length;
              return (
                <div key={category} className={`${S.card} px-5 py-3`}>
                  <h3 className="flex items-center justify-between pt-1 text-sm font-semibold">
                    {ITEM_CATEGORY_LABELS[category]}
                    <span className="text-xs font-normal text-muted">
                      {done}/{list.length}
                    </span>
                  </h3>
                  <ul className="divide-y divide-line">
                    {list.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        anchorId={`item-${item.id}`}
                        {...rowProps}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {canEdit && (
          <details className={`${S.card} px-5 py-3`}>
            <summary className="cursor-pointer text-sm font-medium text-brand">
              + Adicionar item ao checklist
            </summary>
            <form action={addItem.bind(null, edital.id)} className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className={`${S.label} sm:col-span-3`}>
                <span>Título</span>
                <input
                  name="title"
                  required
                  minLength={2}
                  maxLength={300}
                  className={S.control}
                  placeholder="Ex.: Carta de anuência da coprodutora"
                />
              </label>
              <label className={S.label}>
                <span>Categoria</span>
                <select name="category" defaultValue="document" className={S.control}>
                  {ITEM_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {ITEM_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={S.label}>
                <span>Exigência</span>
                <select name="requirement" defaultValue="mandatory" className={S.control}>
                  {ITEM_REQUIREMENTS.map((value) => (
                    <option key={value} value={value}>
                      {ITEM_REQUIREMENT_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={S.label}>
                <span>Responsável</span>
                <select name="responsible_id" defaultValue="" className={S.control}>
                  <option value="">Sem responsável</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-3">
                <button className={S.primary}>Adicionar</button>
              </div>
            </form>
          </details>
        )}
      </Section>

      {/* 4. Documentos exigidos */}
      <Section
        id="documentos"
        title="Documentos exigidos"
        aside={
          <Link href="/editais/acervo" className={S.secondary}>
            Acervo de documentos da LEP
          </Link>
        }
      >
        <p className="text-sm text-muted">
          Vincule cada exigência a um documento do acervo (produtora ou produção): a plataforma
          confere a validade frente ao prazo do edital. {documents.length} documento(s) no acervo
          {assessment.expiredDocuments.length > 0 &&
            `, ${assessment.expiredDocuments.length} vencido(s)`}
          .
        </p>
        <CategoryList
          items={byCategory(["document", "annex"])}
          empty="Nenhum documento exigido no checklist."
          {...rowProps}
        />
      </Section>

      {/* 5. Pendências */}
      <Section id="pendencias" title="Pendências">
        {assessment.pending.length === 0 ? (
          <Empty>
            {allItems.length === 0
              ? "Gere o checklist para ver as pendências."
              : "Nenhum item obrigatório pendente."}
          </Empty>
        ) : (
          <div className={`${S.card} px-5`}>
            <ul className="divide-y divide-line">
              {assessment.pending.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <a href={`#item-${item.id}`} className="min-w-0 flex-1 hover:text-brand">
                    {item.title}
                  </a>
                  <span className="text-xs text-muted">
                    {ITEM_CATEGORY_LABELS[item.category]}
                    {item.dueDate && ` · ${formatDate(item.dueDate)}`}
                    {" · "}
                    {members.find((member) => member.id === item.responsibleId)?.name ??
                      "sem responsável"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {assessment.bonusPending.length > 0 && (
          <p className="text-sm text-muted">
            + {assessment.bonusPending.length} oportunidade(s) de pontuação adicional a avaliar
            (seção Critérios).
          </p>
        )}
      </Section>

      {/* 6. Textos exigidos */}
      <Section id="textos" title="Textos exigidos">
        {byCategory(["text"]).length === 0 ? (
          <Empty>
            Nenhum texto exigido identificado. Adicione no checklist (categoria Textos).
          </Empty>
        ) : (
          <div className="space-y-4">
            {byCategory(["text"]).map((item) => {
              const metrics = assessment.textMetrics[item.id];
              const over = metrics && (metrics.overChars || metrics.overWords || metrics.overPages);
              return (
                <div
                  key={item.id}
                  id={`texto-${item.id}`}
                  className={`${S.card} scroll-mt-24 space-y-3 p-5`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="text-xs text-muted">
                        Limite:{" "}
                        {[
                          item.charLimit && `${item.charLimit.toLocaleString("pt-BR")} caracteres`,
                          item.wordLimit && `${item.wordLimit.toLocaleString("pt-BR")} palavras`,
                          item.pageLimit && `${item.pageLimit} página(s)`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "não identificado (defina em Editar item)"}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {over && <Badge tone="bad">Acima do limite</Badge>}
                      <Badge
                        tone={
                          item.status === "done"
                            ? "ok"
                            : item.status === "in_progress"
                              ? "brand"
                              : "warn"
                        }
                      >
                        {item.status === "done"
                          ? "Concluído"
                          : item.status === "in_progress"
                            ? "Em andamento"
                            : item.status === "not_applicable"
                              ? "Não se aplica"
                              : "Pendente"}
                      </Badge>
                    </div>
                  </div>
                  {item.evidence && (
                    <blockquote className="border-l-2 border-brand/60 pl-3 text-xs italic text-muted">
                      “{item.evidence}”
                    </blockquote>
                  )}
                  <form action={saveItem.bind(null, edital.id, item.id)} className="space-y-2">
                    <input type="hidden" name="anchor" value={`texto-${item.id}`} />
                    <TextDraft
                      name="content"
                      initial={item.content}
                      charLimit={item.charLimit}
                      wordLimit={item.wordLimit}
                      pageLimit={item.pageLimit}
                      readOnly={!canEdit}
                    />
                    {canEdit && <button className={S.secondary}>Salvar texto</button>}
                  </form>
                </div>
              );
            })}
            <p className="text-xs text-muted">
              Páginas são estimadas (≈ 500 palavras por página). Revisão de conteúdo por IA: não
              configurada — ponto de integração preparado (ADR-0026); nenhum texto da LEP é enviado
              a serviços externos.
            </p>
          </div>
        )}
      </Section>

      {/* 7. Orçamento */}
      <Section id="orcamento" title="Orçamento">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`${S.card} space-y-3 p-5`}>
            {canEdit ? (
              <form action={saveWorkspace.bind(null, edital.id)} className="space-y-3">
                <input type="hidden" name="anchor" value="orcamento" />
                {(
                  [
                    [
                      "requested_amount",
                      "Valor solicitado ao edital",
                      workspaceRow.requested_amount,
                    ],
                    ["total_budget", "Orçamento total do projeto", workspaceRow.total_budget],
                    [
                      "counterpart_amount",
                      "Contrapartida / outras fontes",
                      workspaceRow.counterpart_amount,
                    ],
                  ] as const
                ).map(([name, label, value]) => (
                  <label key={name} className={S.label}>
                    <span className="font-medium">{label}</span>
                    <input
                      name={name}
                      inputMode="decimal"
                      placeholder="0,00"
                      defaultValue={toMoneyInput(value)}
                      className={S.control}
                    />
                  </label>
                ))}
                <button className={S.primary}>Salvar valores</button>
              </form>
            ) : (
              <dl className="space-y-2 text-sm">
                <Fact label="Valor solicitado">{formatBRL(workspaceRow.requested_amount)}</Fact>
                <Fact label="Orçamento total">{formatBRL(workspaceRow.total_budget)}</Fact>
                <Fact label="Contrapartida">{formatBRL(workspaceRow.counterpart_amount)}</Fact>
              </dl>
            )}
          </div>
          <div className={`${S.card} space-y-3 p-5`}>
            <h3 className={S.eyebrow}>Verificações</h3>
            <ul className="space-y-2 text-sm">
              {assessment.budgetChecks.map((check) => (
                <li key={check.key} className="flex gap-2">
                  <span
                    aria-hidden
                    className={
                      check.state === "ok"
                        ? "text-ok"
                        : check.state === "fail"
                          ? "text-bad"
                          : "text-muted"
                    }
                  >
                    {check.state === "ok"
                      ? "✓"
                      : check.state === "fail"
                        ? "✕"
                        : check.state === "info"
                          ? "i"
                          : "?"}
                  </span>
                  <span>
                    <span className="font-medium">{check.label}</span>
                    <span className="block text-muted">{check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <CategoryList
          items={byCategory(["budget"])}
          empty="Nenhuma exigência de orçamento no checklist."
          {...rowProps}
        />
      </Section>

      {/* 8. Equipe e responsáveis */}
      <Section id="equipe" title="Equipe e responsáveis">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`${S.card} space-y-2 p-5`}>
            <h3 className={S.eyebrow}>Exigências sobre a equipe</h3>
            <CategoryList
              items={byCategory(["team"])}
              empty="Nenhuma exigência de equipe identificada."
              bare
              {...rowProps}
            />
          </div>
          <div className={`${S.card} space-y-2 p-5`}>
            <h3 className={S.eyebrow}>Responsáveis na LEP</h3>
            <ul className="space-y-1.5 text-sm">
              {members
                .map((member) => ({
                  member,
                  open: allItems.filter(
                    (item) =>
                      item.responsibleId === member.id &&
                      (item.status === "pending" || item.status === "in_progress"),
                  ).length,
                  total: allItems.filter((item) => item.responsibleId === member.id).length,
                }))
                .filter((entry) => entry.total > 0)
                .map(({ member, open, total }) => (
                  <li key={member.id} className="flex justify-between gap-2">
                    <span>{member.name}</span>
                    <span className="text-muted">
                      {open} em aberto / {total}
                    </span>
                  </li>
                ))}
              <li className="flex justify-between gap-2 border-t border-line pt-1.5">
                <span className="text-muted">Obrigatórios em aberto sem responsável</span>
                <span
                  className={
                    assessment.pending.some((item) => !item.responsibleId)
                      ? "text-warn"
                      : "text-muted"
                  }
                >
                  {assessment.pending.filter((item) => !item.responsibleId).length}
                </span>
              </li>
            </ul>
            <p className="text-xs text-muted">
              Responsáveis são membros ativos da plataforma. A ficha técnica da produção virá da
              Equipe Audiovisual quando o cadastro de profissionais estiver no banco.
            </p>
          </div>
        </div>
      </Section>

      {/* 9. Direitos e autorizações */}
      <Section id="direitos" title="Direitos e autorizações">
        <CategoryList
          items={byCategory(["rights"])}
          empty="Nenhuma exigência de direitos/cessões identificada no edital. Confira a cadeia de titularidade no regulamento."
          {...rowProps}
        />
      </Section>

      {/* 10. Critérios de avaliação */}
      <Section id="criterios" title="Critérios de avaliação">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`${S.card} space-y-2 p-5`}>
            <h3 className={S.eyebrow}>
              Critérios identificados{criteriaTotal > 0 && ` · ${criteriaTotal} pontos somados`}
            </h3>
            {rules.criteria.length === 0 ? (
              <p className="text-sm text-muted">
                Nenhum critério com pontuação identificado no texto do edital.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {rules.criteria.map((criterion) => (
                  <li key={criterion.text} className="flex justify-between gap-3">
                    <span>{criterion.text}</span>
                    {criterion.points !== null && (
                      <span className="shrink-0 font-semibold tabular-nums text-brand">
                        {criterion.points} pts
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={`${S.card} space-y-2 p-5`}>
            <h3 className={S.eyebrow}>Oportunidades de pontuação adicional</h3>
            <CategoryList
              items={allItems.filter((item) => item.requirement === "bonus")}
              empty="Nenhuma identificada pelas regras."
              bare
              {...rowProps}
            />
          </div>
        </div>
      </Section>

      {/* 11. Inconsistências encontradas */}
      <Section id="inconsistencias" title="Inconsistências encontradas">
        {assessment.findings.length === 0 ? (
          <Empty>Nenhuma inconsistência encontrada pelas regras.</Empty>
        ) : (
          <div className={`${S.card} px-5`}>
            <ul className="divide-y divide-line">
              {assessment.findings.map((finding) => (
                <li key={finding.key} className="flex flex-wrap items-start gap-3 py-3 text-sm">
                  <Badge tone={SEVERITY[finding.severity].tone}>
                    {SEVERITY[finding.severity].label}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <a
                      href={`#${finding.itemId ? `item-${finding.itemId}` : finding.section}`}
                      className="font-medium hover:text-brand"
                    >
                      {finding.title}
                    </a>
                    <span className="block text-muted">{finding.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* 12. Próximas ações */}
      <Section id="acoes" title="Próximas ações">
        {assessment.nextActions.length === 0 ? (
          <Empty>Nada pendente pelas regras.</Empty>
        ) : (
          <ol className={`${S.card} space-y-0 divide-y divide-line px-5`}>
            {assessment.nextActions.map((action, index) => (
              <li key={action.key} className="flex gap-3 py-3 text-sm">
                <span className="w-5 shrink-0 font-semibold tabular-nums text-brand">
                  {index + 1}
                </span>
                <a
                  href={`#${action.itemId ? `item-${action.itemId}` : action.section}`}
                  className="min-w-0 flex-1 hover:text-brand"
                >
                  <span className="font-medium">{action.title}</span>
                  {action.detail && <span className="block text-muted">{action.detail}</span>}
                </a>
              </li>
            ))}
          </ol>
        )}
        {canEdit && (
          <form action={saveWorkspace.bind(null, edital.id)} className={`${S.card} space-y-2 p-5`}>
            <input type="hidden" name="anchor" value="acoes" />
            <label className={S.label}>
              <span className="font-medium">Anotações da equipe</span>
              <textarea
                name="notes"
                rows={3}
                maxLength={5000}
                defaultValue={workspaceRow.notes ?? ""}
                className={S.control}
              />
            </label>
            <button className={S.secondary}>Salvar anotações</button>
          </form>
        )}
      </Section>

      {isAdmin && (
        <details id="zona-admin" className="rounded-xl border border-bad/30 px-5 py-3 text-sm">
          <summary className="cursor-pointer text-muted hover:text-bad">
            Excluir esta área de trabalho (ADM)
          </summary>
          <form
            action={deleteWorkspace.bind(null, edital.id)}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <label className={S.label}>
              <span>Digite EXCLUIR para confirmar (checklist e textos serão apagados)</span>
              <input name="confirm" className={S.control} autoComplete="off" />
            </label>
            <button className={S.danger}>Excluir</button>
          </form>
        </details>
      )}
    </div>
  );
}

/** numeric do PostgREST pode vir como texto; ausente/ inválido = null. */
function amount(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
}

function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-titulo`} className="text-lg font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={`${S.card} p-4`}>
      <p className={S.eyebrow}>{label}</p>
      <p className="mt-1 font-medium tabular-nums">{children}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line bg-card/50 p-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}

function Notice({ tone, children }: { tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const tones = {
    ok: "border-ok/40 bg-ok/10 text-ok",
    warn: "border-warn/40 bg-warn/10 text-warn",
    bad: "border-bad/40 bg-bad/10 text-bad",
  };
  return (
    <p
      role={tone === "bad" ? "alert" : "status"}
      className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}
    >
      {children}
    </p>
  );
}

function CategoryList({
  items,
  empty,
  bare = false,
  ...rowProps
}: {
  items: WorkspaceItem[];
  empty: string;
  bare?: boolean;
} & Omit<Parameters<typeof ItemRow>[0], "item" | "anchorId" | "compact">) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  const list = (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} compact {...rowProps} />
      ))}
    </ul>
  );
  return bare ? list : <div className={`${S.card} px-5`}>{list}</div>;
}
