import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Theme provider scoped to the Backoffice (control plane) only.
 *
 * - Uses a dedicated localStorage key (`backoffice.theme`) so admin preference
 *   is fully isolated from the customer-facing app (which keeps its own
 *   ThemeProvider in src/components/ThemeProvider.tsx).
 * - Defaults to dark to preserve current admin look-and-feel.
 * - System theme disabled to keep the toggle deterministic.
 */
export function AdminThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="backoffice.theme"
      themes={["light", "dark"]}
    >
      {children}
    </NextThemesProvider>
  );
}
