import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';

export interface Space {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  team_id: string | null;
  created_by: string | null;
  position: number | null;
}

export const spacesKey = (wsId: string) => ['spaces-admin', wsId] as const;

export function useSpacesAdmin() {
  const { current } = useWorkspace();
  return useQuery({
    queryKey: spacesKey(current?.id ?? ''),
    enabled: !!current?.id,
    queryFn: async (): Promise<Space[]> => {
      const { data, error } = await supabase
        .from('spaces')
        .select('id,workspace_id,name,color,team_id,created_by,position')
        .eq('workspace_id', current!.id)
        .order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateSpace() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Space, 'name' | 'color' | 'team_id'>> }) => {
      const { error } = await supabase.from('spaces').update(patch).eq('id', id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => toast.success('Space atualizado'),
    onSettled: () => qc.invalidateQueries({ queryKey: spacesKey(current?.id ?? '') }),
  });
}

export function useDeleteSpace() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  return useMutation({
    mutationFn: async (spaceId: string) => {
      const { error } = await supabase.from('spaces').delete().eq('id', spaceId);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => toast.success('Space removido'),
    onSettled: () => qc.invalidateQueries({ queryKey: spacesKey(current?.id ?? '') }),
  });
}

export function useCreateSpace() {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  return useMutation({
    mutationFn: async (input: { name: string; team_id?: string | null; color?: string }) => {
      const { data, error } = await supabase
        .from('spaces')
        .insert({
          workspace_id: current!.id,
          name: input.name.trim(),
          team_id: input.team_id ?? null,
          color: input.color ?? '#6366f1',
        })
        .select('id,workspace_id,name,color,team_id,created_by,position')
        .single();
      if (error) throw error;
      return data as Space;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => toast.success('Space criado'),
    onSettled: () => qc.invalidateQueries({ queryKey: spacesKey(current?.id ?? '') }),
  });
}
