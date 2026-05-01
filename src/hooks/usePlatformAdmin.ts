import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Phase H7 — Internal staff (platform admin) gate.
 * Backed by `profiles.is_platform_admin`. Server-side RPCs re-check this flag,
 * so the hook is UX-only.
 */
export function useIsPlatformAdmin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['platform-admin', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      if (!user?.id) return false;
      const { data, error } = await supabase
        .from('profiles')
        .select('is_platform_admin')
        .eq('id', user.id)
        .maybeSingle();
      if (error) return false;
      return Boolean((data as { is_platform_admin?: boolean } | null)?.is_platform_admin);
    },
  });
}
