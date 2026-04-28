import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
}

interface WorkspaceCtx {
  workspaces: Workspace[];
  current: Workspace | null;
  setCurrent: (ws: Workspace) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}

const Ctx = createContext<WorkspaceCtx | undefined>(undefined);

const STORAGE_KEY = "flow.currentWorkspaceId";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [current, setCurrentState] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) {
      setWorkspaces([]);
      setCurrentState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, slug, owner_id")
      .order("created_at", { ascending: true });
    if (!error && data) {
      setWorkspaces(data);
      const stored = localStorage.getItem(STORAGE_KEY);
      const found = data.find((w) => w.id === stored) ?? data[0] ?? null;
      setCurrentState(found);
      if (found) localStorage.setItem(STORAGE_KEY, found.id);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setCurrent = (ws: Workspace) => {
    setCurrentState(ws);
    localStorage.setItem(STORAGE_KEY, ws.id);
  };

  return (
    <Ctx.Provider value={{ workspaces, current, setCurrent, refresh, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
