/**
 * Abertura institucional após o login (sem banco de dados).
 *
 * O login bem-sucedido grava um cookie curto `lep_intro`; a área autenticada lê o cookie
 * no servidor e mostra a abertura uma única vez — o próprio componente apaga o cookie ao
 * montar, então navegar ou recarregar não repete. Novo login = nova abertura.
 */
export const INTRO_COOKIE = "lep_intro";
/** Validade do aviso (s): se a pessoa não chegar à plataforma logo após o login, expira. */
export const INTRO_COOKIE_MAX_AGE = 600;
export const INTRO_VIDEO_SRC = "/video/lep-intro.mp4";
/** Limite de segurança (ms): a abertura nunca prende a pessoa, mesmo se o vídeo travar. */
export const INTRO_MAX_MS = 15_000;
/** Se o vídeo não começar a tocar neste tempo (ms), entra direto na plataforma. */
export const INTRO_START_TIMEOUT_MS = 4_000;
