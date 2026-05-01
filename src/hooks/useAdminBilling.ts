import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import * as adminService from '@/lib/billing/adminService';
import type { AdminAccountsFilters } from '@/types/admin-billing';

const KEY = ['admin', 'billing'] as const;

export function useAdminBillingAccounts(filters: AdminAccountsFilters = {}) {
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 25;
  return useQuery({
    queryKey: [...KEY, 'accounts', filters],
    staleTime: 15_000,
    queryFn: () => adminService.listAccounts({
      search: filters.search,
      planCode: filters.planCode,
      subStatus: filters.subStatus,
      dunningStatus: filters.dunningStatus,
      limit: pageSize,
      offset: page * pageSize,
    }),
  });
}

export function useAdminBillingMetrics(windowDays = 30) {
  return useQuery({
    queryKey: [...KEY, 'metrics', windowDays],
    staleTime: 30_000,
    queryFn: () => adminService.getMetrics(windowDays),
  });
}

export function useAdminBillingAccountDetail(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, 'account-detail', workspaceId],
    enabled: !!workspaceId,
    staleTime: 10_000,
    queryFn: () => adminService.getAccountDetail(workspaceId!),
  });
}

function useAdminMutation<TInput, TOutput>(
  fn: (input: TInput) => Promise<TOutput>,
  successMessage: string,
  invalidateWorkspaceId?: (input: TInput) => string | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: KEY });
      const wsId = invalidateWorkspaceId?.(variables);
      if (wsId) {
        qc.invalidateQueries({ queryKey: ['billing'] });
      }
      toast({ title: successMessage });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Falha na operação', description: msg, variant: 'destructive' });
    },
  });
}

export const useAdminChangePlan = () => useAdminMutation(
  adminService.adminChangePlan, 'Plano alterado', (i) => i.workspaceId);

export const useAdminScheduleCancel = () => useAdminMutation(
  adminService.adminScheduleCancel, 'Cancelamento agendado', (i) => i.workspaceId);

export const useAdminResumeSubscription = () => useAdminMutation(
  adminService.adminResumeSubscription, 'Assinatura reativada', (i) => i.workspaceId);

export const useAdminExtendTrial = () => useAdminMutation(
  adminService.adminExtendTrial, 'Trial estendido', (i) => i.workspaceId);

export const useAdminGenerateInvoice = () => useAdminMutation(
  adminService.adminGenerateInvoice, 'Fatura gerada', (i) => i.workspaceId);

export const useAdminMarkInvoice = () => useAdminMutation(
  adminService.adminMarkInvoice, 'Fatura atualizada');

export const useAdminForceDunningRetry = () => useAdminMutation(
  adminService.adminForceDunningRetry, 'Retry executado');

export const useAdminExtendGracePeriod = () => useAdminMutation(
  adminService.adminExtendGracePeriod, 'Período de carência estendido');

export const useAdminCloseDunningCase = () => useAdminMutation(
  adminService.adminCloseDunningCase, 'Caso de inadimplência encerrado');

export const useAdminApplyEntitlementOverride = () => useAdminMutation(
  adminService.adminApplyEntitlementOverride, 'Override aplicado', (i) => i.workspaceId);

export const useAdminRemoveEntitlementOverride = () => useAdminMutation(
  adminService.adminRemoveEntitlementOverride, 'Override removido');
