/** Bucket privado dos documentos de editais (ver migração 20260927120000). */
export const DOCUMENTS_BUCKET = "edital-documents";
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Caminho de upload feito pelo navegador: <org_id>/uploads/<uuid>.pdf */
export function uploadPath(orgId: string, fileId: string) {
  return `${orgId}/uploads/${fileId}.pdf`;
}

export function isValidUploadPath(orgId: string, path: string) {
  return new RegExp(`^${orgId}/uploads/[0-9a-f-]{36}\\.pdf$`).test(path);
}
