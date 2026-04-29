import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GlobalSearchResultType = "task" | "list" | "space";

export interface GlobalSearchResult {
  result_type: GlobalSearchResultType;
  id: string;
  title: string;
  subtitle: string;
  url_path: string;
  updated_at: string;
}

/** Debounce a fast-changing string value. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useGlobalSearch(query: string, workspaceId: string | undefined) {
  const trimmed = query.trim();
  const enabled = !!workspaceId && trimmed.length >= 2;

  return useQuery({
    queryKey: ["global-search", workspaceId, trimmed],
    enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<GlobalSearchResult[]> => {
      const { data, error } = await supabase.rpc("global_search", {
        p_workspace_id: workspaceId!,
        p_query: trimmed,
        p_limit: 20,
      });
      if (error) throw error;
      return (data ?? []) as GlobalSearchResult[];
    },
  });
}
