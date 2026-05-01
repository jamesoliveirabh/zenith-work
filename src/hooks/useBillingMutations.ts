import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { getBillingProvider } from '@/lib/billing';
import type {
  ChangePlanInput,
  CreateSubscriptionInput,
  GenerateInvoiceInput,
  InvoiceTargetInput,
  WorkspaceOnlyInput,
} from '@/types/billing';

const provider = getBillingProvider();

function useInvalidateBilling(workspaceId?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['billing', 'subscription', workspaceId] });
    qc.invalidateQueries({ queryKey: ['billing', 'entitlements', workspaceId] });
    qc.invalidateQueries({ queryKey: ['billing', 'invoices', workspaceId] });
    qc.invalidateQueries({ queryKey: ['billing', 'events', workspaceId] });
  };
}

function onError(err: unknown) {
  toast({
    title: 'Erro de cobrança',
    description: err instanceof Error ? err.message : String(err),
    variant: 'destructive',
  });
}

export function useCreateSubscriptionMock(workspaceId?: string) {
  const invalidate = useInvalidateBilling(workspaceId);
  return useMutation({
    mutationFn: (input: CreateSubscriptionInput) => provider.createSubscription(input),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Assinatura criada' });
    },
    onError,
  });
}

export function useChangePlanMock(workspaceId?: string) {
  const invalidate = useInvalidateBilling(workspaceId);
  return useMutation({
    mutationFn: (input: ChangePlanInput) => provider.changePlan(input),
    onSuccess: (data) => {
      invalidate();
      toast({
        title: data.mode === 'immediate' ? 'Plano alterado' : 'Mudança agendada',
      });
    },
    onError,
  });
}

export function useCancelSubscriptionMock(workspaceId?: string) {
  const invalidate = useInvalidateBilling(workspaceId);
  return useMutation({
    mutationFn: (input: WorkspaceOnlyInput) => provider.cancelSubscription(input),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Cancelamento agendado para o fim do período' });
    },
    onError,
  });
}

export function useResumeSubscriptionMock(workspaceId?: string) {
  const invalidate = useInvalidateBilling(workspaceId);
  return useMutation({
    mutationFn: (input: WorkspaceOnlyInput) => provider.resumeSubscription(input),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Assinatura reativada' });
    },
    onError,
  });
}

export function useGenerateInvoiceMock(workspaceId?: string) {
  const invalidate = useInvalidateBilling(workspaceId);
  return useMutation({
    mutationFn: (input: GenerateInvoiceInput) => provider.generateInvoice(input),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Fatura gerada' });
    },
    onError,
  });
}

export function useMarkInvoicePaidMock(workspaceId?: string) {
  const invalidate = useInvalidateBilling(workspaceId);
  return useMutation({
    mutationFn: (input: InvoiceTargetInput) => provider.markInvoicePaid(input),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Fatura marcada como paga' });
    },
    onError,
  });
}

export function useSimulatePaymentFailureMock(workspaceId?: string) {
  const invalidate = useInvalidateBilling(workspaceId);
  return useMutation({
    mutationFn: (input: InvoiceTargetInput) => provider.markInvoicePastDue(input),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Falha de pagamento simulada' });
    },
    onError,
  });
}

export function useCloseExpiredCancellationsMock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => provider.closeExpiredCancellations(),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['billing'] });
      toast({ title: `Cancelamentos processados`, description: `${data.closed} assinatura(s) encerrada(s).` });
    },
    onError,
  });
}
