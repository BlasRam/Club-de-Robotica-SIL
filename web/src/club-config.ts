/** Configuración del Club de Robótica San Ignacio de Loyola. */
export const CLUB_NAME = "Club de Robótica San Ignacio de Loyola";
export const CLUB_SHORT_NAME = "Club de Robótica";
export const INITIAL_ADMIN_EMAIL = "plataformapy.oficial@gmail.com";

/**
 * Dominio de correo que la institución autorizará para registrarse.
 * Reemplazar cuando el club confirme el dominio. Dejar vacío mantiene cerrado el registro.
 */
export const INSTITUTIONAL_EMAIL_DOMAIN = "";

export function isInstitutionalEmail(email: string): boolean {
  if (isInitialAdminEmail(email)) return true;
  const domain = INSTITUTIONAL_EMAIL_DOMAIN.trim().toLowerCase();
  return Boolean(domain) && new RegExp(`^[^@\\s]+@${escapeRegExp(domain)}$`, "i").test(email.trim());
}

export function isInitialAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === INITIAL_ADMIN_EMAIL;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
