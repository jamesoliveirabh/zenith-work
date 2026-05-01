import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addInternalNote,
  getClientDetail,
  listClients,
  reactivateWorkspace,
  suspendWorkspace,
  type ListClientsInput,
} from "@/lib/admin/clientsService";

export const clientsKeys = {
  list: (input: ListClientsInput) => ["admin", "clients", "list", input] as const,
  detail: (id: string) => ["admin", "clients", "detail", id] as const,
};

export function useClientsList(input: ListClientsInput) {
  return useQuery({
    queryKey: clientsKeys.list(input),
    queryFn: () => listClients(input),
    staleTime: 15_000,
  });
}

export function useClientDetail(workspaceId: string | undefined) {
  return useQuery({
    queryKey: clientsKeys.detail(workspaceId ?? ""),
    queryFn: () => getClientDetail(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 10_000,
  });
}

export function useSuspendWorkspace(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => suspendWorkspace(workspaceId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "clients"] });
    },
  });
}

export function useReactivateWorkspace(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => reactivateWorkspace(workspaceId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "clients"] });
    },
  });
}

export function useAddInternalNote(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addInternalNote(workspaceId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientsKeys.detail(workspaceId) });
    },
  });
}
