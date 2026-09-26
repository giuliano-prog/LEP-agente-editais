import { describe, expect, it } from "vitest";
import { describeDbError } from "./errors";

describe("describeDbError", () => {
  it.each([
    [
      {
        code: "PGRST106",
        message: "The schema must be one of the following: public, graphql_public",
      },
      "schema_not_exposed",
    ],
    [
      {
        code: "PGRST205",
        message: "Could not find the table 'core.edital_sources' in the schema cache",
      },
      "missing_table",
    ],
    [{ code: "42P01", message: 'relation "core.editais" does not exist' }, "missing_table"],
    [{ code: "42703", message: "column editais.origin does not exist" }, "missing_column"],
    [
      {
        code: "PGRST204",
        message: "Could not find the 'origin' column of 'editais' in the schema cache",
      },
      "missing_column",
    ],
    [{ code: "42501", message: "permission denied for table editais" }, "permission"],
    [{ code: "PGRST301", message: "JWT expired" }, "session"],
    [{ code: "", message: "TypeError: fetch failed" }, "unreachable"],
    [{ code: "XX000", message: "algo" }, "unknown"],
  ])("%o → %s", (error, kind) => {
    expect(describeDbError(error)?.kind).toBe(kind);
  });

  it("sem erro, sem problema", () => {
    expect(describeDbError(null)).toBeNull();
  });
});
