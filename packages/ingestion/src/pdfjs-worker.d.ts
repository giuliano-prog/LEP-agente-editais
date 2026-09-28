// O módulo do worker do pdfjs-dist não publica tipos; só é importado pelo efeito
// (define globalThis.pdfjsWorker).
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
