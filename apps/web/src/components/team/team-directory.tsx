"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui";
import {
  TEAM_CATEGORIES,
  categoriesOf,
  filterProfessionals,
  type Professional,
} from "@/lib/team/model";

/** Busca (nome/função), filtro por categoria e lista de profissionais. */
export function TeamDirectory({
  professionals,
  isDemo = false,
}: {
  professionals: Professional[];
  isDemo?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const visible = useMemo(
    () => filterProfessionals(professionals, { query, category }),
    [professionals, query, category],
  );
  const counts = useMemo(
    () =>
      new Map(
        TEAM_CATEGORIES.map((item) => [
          item.key,
          filterProfessionals(professionals, { category: item.key }).length,
        ]),
      ),
    [professionals],
  );

  return (
    <div className="space-y-6">
      <label className="block">
        <span className="sr-only">Buscar Profissional</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar profissional por nome ou função"
          className="w-full rounded-md border border-line bg-card-raised px-3 py-2 text-sm text-fg outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </label>

      <nav aria-label="Categorias" className="flex flex-wrap gap-2 text-xs">
        <CategoryChip active={category === null} onClick={() => setCategory(null)}>
          Todas ({professionals.length})
        </CategoryChip>
        {TEAM_CATEGORIES.map((item) => (
          <CategoryChip
            key={item.key}
            active={category === item.key}
            onClick={() => setCategory(category === item.key ? null : item.key)}
          >
            {item.label} ({counts.get(item.key) ?? 0})
          </CategoryChip>
        ))}
      </nav>

      <section aria-labelledby="profissionais" className="space-y-3">
        <h2 id="profissionais" className="text-lg font-semibold">
          Profissionais cadastrados
        </h2>
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-card/50 p-6 text-center text-sm text-muted">
            Nenhum profissional encontrado.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((professional) => (
              <li key={professional.slug}>
                <Link
                  href={`/equipe-audiovisual/${professional.slug}`}
                  className="group flex min-w-0 items-center gap-3 rounded-xl border border-line bg-card p-4 transition hover:border-brand/60 hover:bg-card-raised"
                >
                  <Avatar name={professional.name} src={professional.photoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium group-hover:text-brand">
                      {professional.name}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {professional.mainRole}
                      {categoriesOf(professional)[0] &&
                        ` · ${categoriesOf(professional)[0]!.label}`}
                    </span>
                  </span>
                  {isDemo && <Badge>Exemplo</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 transition ${
        active
          ? "border-brand bg-brand/10 text-brand"
          : "border-line text-muted hover:border-brand hover:text-brand"
      }`}
    >
      {children}
    </button>
  );
}
