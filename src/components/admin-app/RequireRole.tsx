import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useMyPlatformRoles } from "@/hooks/admin/useSecurity";
import type { PlatformRole } from "@/lib/admin/securityService";

interface Props {
  /** User must have at least one of these roles. */
  anyOf: PlatformRole[];
  children: ReactNode;
}

/**
 * Phase P3 — Module-level RBAC gate.
 * Deny by default. Server enforces the same rules via RPCs.
 */
export function RequireRole({ anyOf, children }: Props) {
  const { data: roles, isLoading } = useMyPlatformRoles();

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 text-sm text-muted-foreground">Verificando permissões…</div>
    );
  }

  const allowed = (roles ?? []).some((r) => anyOf.includes(r));
  if (!allowed) {
    return (
      <div className="container mx-auto p-6">
        <div className="rounded-lg border bg-card p-8 text-center max-w-lg mx-auto">
          <ShieldAlert className="h-10 w-10 text-destructive mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground">
            Este módulo requer um dos papéis: <strong>{anyOf.join(", ")}</strong>.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Convenience: renders only if user has any of the given roles. */
export function CanRole({ anyOf, children }: { anyOf: PlatformRole[]; children: ReactNode }) {
  const { data: roles } = useMyPlatformRoles();
  if (!(roles ?? []).some((r) => anyOf.includes(r))) return null;
  return <>{children}</>;
}
