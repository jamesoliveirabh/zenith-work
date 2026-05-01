/**
 * Phase P0 — Global Backoffice host detection.
 *
 * The admin backoffice runs on a dedicated subdomain (e.g. admin.seudominio.com).
 * We detect it from the current hostname OR from VITE_ADMIN_APP_BASE_URL so that
 * the same SPA bundle can mount either the customer app or the admin app.
 *
 * Override for local dev: append `?admin=1` to the URL (persisted in sessionStorage).
 */

const ADMIN_OVERRIDE_KEY = "platform_admin_host_override";

export function getAdminBaseUrl(): string {
  return (
    (import.meta.env.VITE_ADMIN_APP_BASE_URL as string | undefined) ??
    "https://admin.seudominio.com"
  );
}

function adminHostnameFromBaseUrl(): string | null {
  try {
    return new URL(getAdminBaseUrl()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isAdminHost(): boolean {
  if (typeof window === "undefined") return false;

  // Dev override via query param: ?admin=1 (or ?admin=0 to disable)
  const params = new URLSearchParams(window.location.search);
  const override = params.get("admin");
  if (override === "1") {
    sessionStorage.setItem(ADMIN_OVERRIDE_KEY, "1");
  } else if (override === "0") {
    sessionStorage.removeItem(ADMIN_OVERRIDE_KEY);
  }
  if (sessionStorage.getItem(ADMIN_OVERRIDE_KEY) === "1") return true;

  const host = window.location.hostname.toLowerCase();
  if (host.startsWith("admin.")) return true;

  const configured = adminHostnameFromBaseUrl();
  if (configured && host === configured) return true;

  return false;
}

/**
 * Storage key namespace used by the Supabase auth client. The admin app uses
 * a distinct key so that an admin session on admin.* does NOT share state with
 * a customer session on app.* (cookies/localStorage isolation by subdomain
 * happens naturally; this guards the same-origin dev override case).
 */
export function authStorageKey(): string {
  return isAdminHost() ? "sb-platform-admin-auth" : "sb-customer-auth";
}
