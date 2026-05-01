// Phase H6 — React Query hooks for dunning.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  dunningCancelNonpayment,
  dunningExtendGrace,
  dunningProcessDue,
  dunningProcessExpired,
  dunningRecordAttempt,
  dunningSimulatePaymentMethodUpdate,
  dunningSimulateRetryFailure,
  dunningSimulateRetrySuccess,
} from '@/lib/billing/dunningService';
import type { DunningAttempt, DunningCase, DunningPolicy } from '@/lib/billing/dunningPolicy';
import { toast } from 'sonner';

const KEY = (ws?: string | null) => ['billing', 'dunning', ws] as const;

export function useDunningPolicy(workspaceId?: string | null) {
  return useQuery({
    queryKey: [...KEY(workspaceId), 'policy'],
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DunningPolicy | null> => {
      const { data, error } = await supabase.rpc('billing_dunning_get_policy', {
        _workspace_id: workspaceId!,
      });
      if (error) throw error;
      return (data as unknown as DunningPolicy) ?? null;
    },
  });
}

export function useWorkspaceDunningCases(workspaceId?: string | null) {
  return useQuery({
    queryKey: [...KEY(workspaceId), 'cases'],
    enabled: !!workspaceId,
    staleTime: 15_000,
    queryFn: async (): Promise<DunningCase[]> => {
      const { data, error } = await supabase
        .from('billing_dunning_cases')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DunningCase[];
    },
  });
}

export function useActiveDunningCase(workspaceId?: string | null) {
  const cases = useWorkspaceDunningCases(workspaceId);
  const active = cases.data?.find((c) => ['open', 'recovering', 'exhausted'].includes(c.status)) ?? null;
  return { ...cases, data: active };
}

export function useDunningAttempts(caseId?: string | null) {
  return useQuery({
    queryKey: ['billing', 'dunning', 'attempts', caseId],
    enabled: !!caseId,
    staleTime: 15_000,
    queryFn: async (): Promise<DunningAttempt[]> => {
      const { data, error } = await supabase
        .from('billing_dunning_attempts')
        .select('*')
        .eq('dunning_case_id', caseId!)
        .order('attempt_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DunningAttempt[];
    },
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>, workspaceId?: string | null) {
  qc.invalidateQueries({ queryKey: ['billing'] });
  if (workspaceId) qc.invalidateQueries({ queryKey: KEY(workspaceId) });
}

export function useSimulatePaymentMethodUpdate(workspaceId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => dunningSimulatePaymentMethodUpdate({ workspaceId: workspaceId! }),
    onSuccess: (res) => {
      toast.success(`Pagamento simulado: ${res.recovered_cases} caso(s) recuperado(s).`);
      invalidateAll(qc, workspaceId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSimulateRetrySuccess(workspaceId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => dunningSimulateRetrySuccess({ caseId }),
    onSuccess: () => { toast.success('Tentativa marcada como paga.'); invalidateAll(qc, workspaceId); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSimulateRetryFailure(workspaceId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => dunningSimulateRetryFailure({ caseId }),
    onSuccess: () => { toast.message('Tentativa registrada como falha.'); invalidateAll(qc, workspaceId); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExtendGrace(workspaceId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { caseId: string; additionalDays: number; reason: string }) =>
      dunningExtendGrace(input),
    onSuccess: () => { toast.success('Período de carência estendido.'); invalidateAll(qc, workspaceId); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCancelForNonpayment(workspaceId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { caseId: string; reason: string }) => dunningCancelNonpayment(input),
    onSuccess: () => { toast.success('Assinatura cancelada por inadimplência.'); invalidateAll(qc, workspaceId); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRecordAttempt(workspaceId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { caseId: string; result: 'paid' | 'failed' | 'skipped'; reason?: string }) =>
      dunningRecordAttempt(input),
    onSuccess: () => invalidateAll(qc, workspaceId),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useProcessDueRetries(workspaceId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (forceResult?: 'paid' | 'failed') => dunningProcessDue({ forceResult }),
    onSuccess: (res) => {
      toast.success(`Scheduler executou ${res.processed_count} caso(s).`);
      invalidateAll(qc, workspaceId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useProcessExpiredGrace(workspaceId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => dunningProcessExpired(),
    onSuccess: (res) => {
      toast.success(`Carências expiradas processadas: ${res.closed}.`);
      invalidateAll(qc, workspaceId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
