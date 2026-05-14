import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type GlobalRole = "superadmin" | "admin" | "gestor" | "user";

export function useRoleBasedAccess() {
  const { user } = useAuth();
  const [globalRole, setGlobalRole] = useState<GlobalRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setGlobalRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (supabase as any)
      .from("users")
      .select("global_role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) {
          console.error("Error fetching user role:", error);
          setGlobalRole("user");
        } else {
          setGlobalRole(((data?.global_role as GlobalRole) ?? "user"));
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const inRole = (roles: GlobalRole[]) => !!globalRole && roles.includes(globalRole);

  return {
    globalRole,
    loading,
    isSuperAdmin: globalRole === "superadmin",
    isAdmin: globalRole === "admin",
    isGestor: globalRole === "gestor",
    isMember: globalRole === "user",
    canCreateWorkspace: inRole(["superadmin", "admin", "gestor"]),
    canDeleteWorkspace: inRole(["superadmin", "admin"]),
    canInviteAdmin: globalRole === "superadmin",
    canInviteGestor: inRole(["superadmin", "admin"]),
    canInviteMember: inRole(["superadmin", "admin", "gestor"]),
    canManageMembers: inRole(["superadmin", "admin"]),
  };
}
