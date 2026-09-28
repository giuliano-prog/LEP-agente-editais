import { describe, expect, it } from "vitest";
import { inspectServiceKey } from "./service-key";

const jwt = (payload: object) =>
  ["x", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");

describe("inspectServiceKey", () => {
  it.each([
    [undefined, "missing"],
    ["  ", "missing"],
    ["sb_secret_abc123", "secret"],
    ["sb_publishable_abc123", "publishable"],
    [jwt({ role: "service_role" }), "service_role_jwt"],
    [jwt({ role: "anon" }), "anon_jwt"],
    [jwt({ role: "authenticated" }), "other_jwt"],
    ["a.b.c", "unknown"],
    ["qualquer-coisa", "unknown"],
  ])("%s → %s", (key, kind) => {
    expect(inspectServiceKey(key)).toBe(kind);
  });
});
