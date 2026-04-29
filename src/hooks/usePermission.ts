import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Reactive permission checker. Returns null while loading, then boolean.
 * Usage: const canManage = usePermission('manage_users');
 */
export function usePermission(key: string): boolean | null {
  const { current } = useWorkspace();
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!current || !user) { setAllowed(null); return; }
      const { data, error } = await supabase.rpc("has_permission", {
        _user: user.id, _ws: current.id, _key: key,
      });
      if (cancelled) return;
      setAllowed(error ? false : Boolean(data));
    };
    check();
    return () => { cancelled = true; };
  }, [current?.id, user?.id, key]);

  return allowed;
}
