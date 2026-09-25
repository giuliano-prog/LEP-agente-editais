import { describe, expect, it } from "vitest";
import { passwordSchema } from "./password";

describe("passwordSchema", () => {
  it("aceita senha forte", () => {
    expect(passwordSchema.safeParse("SenhaForte123").success).toBe(true);
  });

  it("rejeita senhas fracas", () => {
    expect(passwordSchema.safeParse("Curta1").success).toBe(false);
    expect(passwordSchema.safeParse("semmaiusculas123").success).toBe(false);
    expect(passwordSchema.safeParse("SEMMINUSCULAS123").success).toBe(false);
    expect(passwordSchema.safeParse("SemNumerosAqui").success).toBe(false);
  });
});
