import { describe, expect, it } from "vitest";
import { AVATAR_MAX_BYTES, avatarObjectPath, checkAvatar, uploadedFile } from "./avatar-rules";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");

describe("foto de perfil", () => {
  it("aceita JPEG, PNG e WebP pelo conteúdo", () => {
    expect(checkAvatar(1000, PNG)).toMatchObject({ ok: true, contentType: "image/png" });
    expect(checkAvatar(1000, JPEG)).toMatchObject({ ok: true, extension: "jpg" });
    expect(checkAvatar(1000, WEBP)).toMatchObject({ ok: true, contentType: "image/webp" });
  });

  it("recusa outros tipos (SVG, PDF, texto), vazio e acima de 2 MB", () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>");
    const pdf = new TextEncoder().encode("%PDF-1.7 xxxxx");
    expect(checkAvatar(1000, svg)).toEqual({ ok: false, error: "Use uma foto JPG, PNG ou WebP." });
    expect(checkAvatar(1000, pdf).ok).toBe(false);
    expect(checkAvatar(0, PNG).ok).toBe(false);
    expect(checkAvatar(AVATAR_MAX_BYTES + 1, PNG)).toEqual({
      ok: false,
      error: "A foto deve ter no máximo 2 MB.",
    });
    expect(checkAvatar(AVATAR_MAX_BYTES, PNG).ok).toBe(true);
  });

  it("caminho sempre na pasta da própria pessoa", () => {
    const path = avatarObjectPath("u-123", "png", 42);
    expect(path.startsWith("u-123/42-")).toBe(true);
    expect(path.endsWith(".png")).toBe(true);
  });

  it("campo de arquivo vazio não conta como foto", () => {
    expect(uploadedFile(new File([], ""))).toBeNull();
    expect(uploadedFile("texto")).toBeNull();
    expect(uploadedFile(null)).toBeNull();
    expect(uploadedFile(new File([PNG], "a.png"))).not.toBeNull();
  });
});
