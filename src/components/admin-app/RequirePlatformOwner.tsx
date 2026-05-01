import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyPlatformRoles } from "@/hooks/admin/useSecurity";
import AdminAccessDenied from "@/pages/admin-app/AdminAccessDenied";

/**
 * Phase P0/P3 — Backoffice gate.
 * Allows any user with at least one active platform-admin role
 * (platform_owner / finance_admin / support_admin / security_admin).
 * Per-module access is then refined via <RequireRole>.
 */
export function RequirePlatformOwner({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { data: roles, isLoading } = useMyPlatformRoles();
  const location = useLocation();

  if (loading || (user && isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!roles || roles.length === 0) {
    return <AdminAccessDenied />;
  }

  return <>{children}</>;
}
