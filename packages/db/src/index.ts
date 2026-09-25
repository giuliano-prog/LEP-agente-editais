export type { Database, Json } from "./database.types";

import type { Database } from "./database.types";

type CoreSchema = Database["core"];

/** Linha de uma tabela do schema core. Ex.: `CoreRow<"memberships">`. */
export type CoreRow<T extends keyof CoreSchema["Tables"]> = CoreSchema["Tables"][T]["Row"];

export type AppRole = CoreSchema["Enums"]["app_role"];
