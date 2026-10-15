import {
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS,
  ITEM_REQUIREMENT_LABELS,
  ITEM_REQUIREMENTS,
  ITEM_STATUS_LABELS,
  ITEM_STATUSES,
  type ItemStatus,
  type OrgDocument,
  type WorkspaceItem,
} from "@lep/funding";
import { deleteItem, saveItem, setItemStatus } from "@/app/(app)/editais/[id]/trabalho/actions";
import { Badge, type BadgeTone } from "@/components/ui";
import { CONFIDENCE_LABELS, SOURCE_KIND_LABELS } from "@/lib/assistant/evidence";
import type { AssistantItem } from "@/lib/assistant/store";
import { formatDate } from "@/lib/format";
import { CONFIDENCE_TONES } from "./finding-list";
import { OpenDocument } from "./open-document";
import { S } from "./styles";

export type Member = { id: string; name: string };

/** Item do checklist; os campos do Assistente LEP são opcionais (telas sem IA). */
export type RowItem = WorkspaceItem & Partial<Omit<AssistantItem, keyof WorkspaceItem>>;

export const STATUS_TONES: Record<ItemStatus, BadgeTone> = {
  pending: "warn",
  in_progress: "brand",
  done: "ok",
  not_applicable: "neutral",
};

const QUICK: { status: ItemStatus; label: string }[] = [
  { status: "in_progress", label: "Em andamento" },
  { status: "done", label: "Concluir" },
  { status: "not_applicable", label: "Não se aplica" },
  { status: "pending", label: "Reabrir" },
];

/** Linha do checklist: leitura para todos; status rápido e edição para Diretoria/ADM. */
export function ItemRow({
  item,
  editalId,
  canEdit,
  members,
  documents,
  anchorId,
  compact = false,
}: {
  item: RowItem;
  editalId: string;
  canEdit: boolean;
  members: Member[];
  documents: OrgDocument[];
  /** id HTML da linha (só a do checklist completo recebe `item-<id>`). */
  anchorId?: string;
  compact?: boolean;
}) {
  const responsible = members.find((member) => member.id === item.responsibleId);
  const document = documents.find((doc) => doc.id === item.orgDocumentId);
  const anchor = anchorId ?? `item-${item.id}`;
  return (
    <li id={anchorId} className="scroll-mt-24 space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className={`break-words ${item.status === "not_applicable" ? "text-muted line-through" : "font-medium"}`}
          >
            {item.title}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge tone={STATUS_TONES[item.status]}>{ITEM_STATUS_LABELS[item.status]}</Badge>
            {item.requirement !== "mandatory" && (
              <Badge tone={item.requirement === "bonus" ? "brand" : "neutral"}>
                {ITEM_REQUIREMENT_LABELS[item.requirement]}
              </Badge>
            )}
            {!compact && <Badge>{ITEM_CATEGORY_LABELS[item.category]}</Badge>}
            {item.origin === "manual" && <Badge>Manual</Badge>}
            {item.confidence && (
              <Badge tone={CONFIDENCE_TONES[item.confidence]}>
                {CONFIDENCE_LABELS[item.confidence]}
              </Badge>
            )}
            {item.updatedVia === "assistant" && (
              <Badge tone="brand">✦ Alterado pelo Assistente</Badge>
            )}
            <span className="text-muted">
              {responsible ? `Responsável: ${responsible.name}` : "Sem responsável"}
              {item.dueDate && ` · prazo interno ${formatDate(item.dueDate)}`}
            </span>
          </div>
          {item.description && <p className="text-sm text-muted">{item.description}</p>}
          {document && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
              Documento do acervo: <span className="text-fg">{document.title}</span>
              {document.validUntil && <span>(válido até {formatDate(document.validUntil)})</span>}
              {document.filePath && <OpenDocument documentId={document.id} />}
            </p>
          )}
          {item.notes && <p className="text-xs text-muted">Obs.: {item.notes}</p>}
          {(item.evidence || item.evidenceDocument || item.sourceKind) && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer hover:text-brand">
                {item.updatedVia === "assistant"
                  ? "Por que a IA concluiu isso?"
                  : "Trecho do edital"}
              </summary>
              <div className="mt-1 space-y-1 border-l-2 border-brand/60 pl-3">
                {(item.sourceKind || item.evidenceDocument) && (
                  <p>
                    {item.sourceKind && SOURCE_KIND_LABELS[item.sourceKind]}
                    {item.evidenceDocument && ` · ${item.evidenceDocument}`}
                    {item.evidencePage ? `, p. ${item.evidencePage}` : ""}
                    {item.evidenceSection ? ` · ${item.evidenceSection}` : ""}
                  </p>
                )}
                {item.evidence ? (
                  <blockquote className="italic">“{item.evidence}”</blockquote>
                ) : (
                  <p>Sem trecho literal do documento.</p>
                )}
              </div>
            </details>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-1.5">
            {QUICK.filter((quick) => quick.status !== item.status)
              .filter((quick) => quick.status !== "pending" || item.status !== "in_progress")
              .slice(0, 3)
              .map((quick) => (
                <form
                  key={quick.status}
                  action={setItemStatus.bind(null, editalId, item.id, quick.status, anchor)}
                >
                  <button
                    className={
                      quick.status === "done"
                        ? S.small.replace("border-line", "border-ok/40")
                        : S.small
                    }
                  >
                    {quick.label}
                  </button>
                </form>
              ))}
          </div>
        )}
      </div>

      {canEdit && !compact && (
        <details className="rounded-lg border border-line bg-card-raised/40 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-xs text-muted hover:text-brand">
            Editar item
          </summary>
          <form
            action={saveItem.bind(null, editalId, item.id)}
            className="mt-3 grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="anchor" value={anchor} />
            {item.origin === "manual" && (
              <>
                <label className={`${S.label} sm:col-span-2`}>
                  <span>Título</span>
                  <input
                    name="title"
                    defaultValue={item.title}
                    required
                    minLength={2}
                    maxLength={300}
                    className={S.control}
                  />
                </label>
                <label className={S.label}>
                  <span>Categoria</span>
                  <select name="category" defaultValue={item.category} className={S.control}>
                    {ITEM_CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {ITEM_CATEGORY_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className={S.label}>
              <span>Exigência</span>
              <select name="requirement" defaultValue={item.requirement} className={S.control}>
                {ITEM_REQUIREMENTS.map((value) => (
                  <option key={value} value={value}>
                    {ITEM_REQUIREMENT_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className={S.label}>
              <span>Status</span>
              <select name="status" defaultValue={item.status} className={S.control}>
                {ITEM_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {ITEM_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className={S.label}>
              <span>Responsável</span>
              <select
                name="responsible_id"
                defaultValue={item.responsibleId ?? ""}
                className={S.control}
              >
                <option value="">Sem responsável</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={S.label}>
              <span>Prazo interno</span>
              <input
                type="date"
                name="due_date"
                defaultValue={item.dueDate ?? ""}
                className={S.control}
              />
            </label>
            {item.category !== "text" && (
              <label className={S.label}>
                <span>Documento do acervo</span>
                <select
                  name="org_document_id"
                  defaultValue={item.orgDocumentId ?? ""}
                  className={S.control}
                >
                  <option value="">Nenhum</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                      {doc.validUntil ? ` (até ${formatDate(doc.validUntil)})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {item.category === "text" && (
              <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                {(
                  [
                    ["char_limit", "Máx. caracteres", item.charLimit],
                    ["word_limit", "Máx. palavras", item.wordLimit],
                    ["page_limit", "Máx. páginas", item.pageLimit],
                  ] as const
                ).map(([name, label, value]) => (
                  <label key={name} className={S.label}>
                    <span className="text-xs">{label}</span>
                    <input
                      name={name}
                      inputMode="numeric"
                      defaultValue={value ?? ""}
                      className={S.control}
                    />
                  </label>
                ))}
              </div>
            )}
            <label className={`${S.label} sm:col-span-2`}>
              <span>Observação</span>
              <input
                name="notes"
                defaultValue={item.notes ?? ""}
                maxLength={2000}
                className={S.control}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button className={S.primary}>Salvar item</button>
            </div>
          </form>
          {item.origin === "manual" && (
            <form action={deleteItem.bind(null, editalId, item.id)} className="mt-2">
              <button className={S.danger}>Excluir item manual</button>
            </form>
          )}
        </details>
      )}
    </li>
  );
}
