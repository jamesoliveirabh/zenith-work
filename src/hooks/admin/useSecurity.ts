import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import * as svc from "@/lib/admin/securityService";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const KEY = ["admin", "security"] as const;

export function useAdminUsers() {
  return useQuery({
    queryKey: [...KEY, "admins"],
    staleTime: 15_000,
    queryFn: svc.listAdmins,
  });
}

export function useAdminSessions() {
  return useQuery({
    queryKey: [...KEY, "sessions"],
    staleTime: 10_000,
    queryFn: svc.listSessions,
  });
}

export function useAdminAudit(input: { search?: string; event?: string; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: [...KEY, "audit", input],
    staleTime: 10_000,
    queryFn: () => svc.listAudit(input),
  });
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: [...KEY, "settings"],
    staleTime: 30_000,
    queryFn: svc.getSettings,
  });
}

/** Current user's active platform roles. */
export function useMyPlatformRoles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...KEY, "my-roles", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_admin_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      const roles = new Set<string>((data ?? []).map((r) => r.role as string));
      // Owner flag still grants platform_owner
      const { data: prof } = await supabase
        .from("profiles").select("is_platform_admin").eq("id", user!.id).maybeSingle();
      if (prof?.is_platform_admin) roles.add("platform_owner");
      return Array.from(roles) as svc.PlatformRole[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

function makeMutation<I, O>(fn: (i: I) => Promise<O>, msg: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { invalidate(); toast({ title: msg }); },
    onError: (e: unknown) => toast({
      title: "Falha", description: e instanceof Error ? e.message : "Erro", variant: "destructive",
    }),
  });
}

export const useGrantRole = () => makeMutation(svc.grantRole, "Papel concedido");
export const useRevokeRole = () => makeMutation(svc.revokeRole, "Papel revogado");
export const useSetDisabled = () => makeMutation(svc.setDisabled, "Status atualizado");
export const useRevokeSession = () => makeMutation(svc.revokeSession, "Sessão revogada");
export const useSetMfaEnforcement = () => makeMutation(svc.setMfaEnforcement, "Política MFA atualizada");
