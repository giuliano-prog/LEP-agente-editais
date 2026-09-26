import { CLOSED_STATUSES, editalStatusLabel } from "@lep/funding";
import { Badge, type BadgeTone } from "@/components/ui";
import { daysUntil, formatDate } from "@/lib/format";

export function EditalStatusBadge({ status }: { status: string | null }) {
  const tone: BadgeTone =
    status === "open"
      ? "ok"
      : status === "upcoming"
        ? "brand"
        : status && CLOSED_STATUSES.has(status)
          ? "bad"
          : "neutral";
  return <Badge tone={tone}>{editalStatusLabel(status)}</Badge>;
}

export function ReviewBadge({ reviewStatus }: { reviewStatus: string | null }) {
  return reviewStatus === "validated" ? (
    <Badge tone="ok">✓ Revisado pela equipe</Badge>
  ) : (
    <Badge tone="warn">⚠ Revisão humana pendente</Badge>
  );
}

export function Deadline({ value }: { value: string | null }) {
  const days = daysUntil(value);
  return (
    <span className="whitespace-nowrap">
      {formatDate(value)}
      {days !== null && (
        <span
          className={`ml-2 text-xs ${days < 0 ? "text-muted" : days <= 7 ? "text-warn" : "text-muted"}`}
        >
          {days < 0 ? "encerrado" : days === 0 ? "hoje" : `${days} dia(s)`}
        </span>
      )}
    </span>
  );
}
