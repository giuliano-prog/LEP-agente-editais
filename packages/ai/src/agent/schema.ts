/**
 * Construtores de JSON Schema compatíveis com `strict: true` (saídas estruturadas):
 * todo objeto fecha propriedades extras e lista todas as chaves em `required`;
 * campos opcionais são `anyOf [tipo, null]`. Restrições numéricas/de tamanho não são
 * suportadas pela API em modo estrito — a validação fina é feita no servidor (Zod).
 */
import type { JsonSchema } from "./types";

export const s = {
  string: (description?: string): JsonSchema => ({
    type: "string",
    ...(description ? { description } : {}),
  }),
  integer: (description?: string): JsonSchema => ({
    type: "integer",
    ...(description ? { description } : {}),
  }),
  number: (description?: string): JsonSchema => ({
    type: "number",
    ...(description ? { description } : {}),
  }),
  boolean: (description?: string): JsonSchema => ({
    type: "boolean",
    ...(description ? { description } : {}),
  }),
  enumOf: (values: readonly string[], description?: string): JsonSchema => ({
    type: "string",
    enum: [...values],
    ...(description ? { description } : {}),
  }),
  array: (items: JsonSchema, description?: string): JsonSchema => ({
    type: "array",
    items,
    ...(description ? { description } : {}),
  }),
  nullable: (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: "null" }] }),
  object: (properties: Record<string, JsonSchema>, description?: string): JsonSchema => ({
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
    ...(description ? { description } : {}),
  }),
};
