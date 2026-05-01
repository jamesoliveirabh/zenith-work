import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsPlatformAdmin } from "@/hooks/usePlatformAdmin";
import AdminAccessDenied from "@/pages/admin-app/AdminAccessDenied";

/**
 * Phase P0 — Guard for the platform-owner backoffice.
 * - Unauthenticated → redirect to /login (admin login page).
 * - Authenticated but not platform admin → render AdminAccessDenied (audited).
 * - Authenticated platform admin → render children.
 */
export function RequirePlatformOwner({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { data: isAdmin, isLoading } = useIsPlatformAdmin();
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

  if (!isAdmin) {
    return <AdminAccessDenied />;
  }

  return <>{children}</>;
}
