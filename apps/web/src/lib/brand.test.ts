import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEP_LOGO } from "./brand";

describe("LEP_LOGO", () => {
  it("dimensões declaradas batem com o PNG (evita distorção se o arquivo mudar)", () => {
    const file = fileURLToPath(new URL(`../../public${LEP_LOGO.src}`, import.meta.url));
    const png = readFileSync(file);
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({
      width: LEP_LOGO.width,
      height: LEP_LOGO.height,
    });
  });
});
