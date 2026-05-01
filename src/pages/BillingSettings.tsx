import { useMemo, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useMyOrgAccess } from '@/hooks/useOrgRole';
import {
  usePlans, useWorkspaceSubscription,
} from '@/hooks/useBillingFoundation';
import { useWorkspaceInvoices, useBillingEvents } from '@/hooks/useBillingReads';
import {
  useCreateSubscriptionMock, useChangePlanMock,
  useCancelSubscriptionMock, useResumeSubscriptionMock,
} from '@/hooks/useBillingMutations';
import { BillingHomologationBanner } from '@/components/billing/BillingHomologationBanner';
import { BillingSummaryCard } from '@/components/billing/BillingSummaryCard';
import { PlanComparisonGrid } from '@/components/billing/PlanComparisonGrid';
import { InvoiceTable } from '@/components/billing/InvoiceTable';
import { BillingEventsTimeline } from '@/components/billing/BillingEventsTimeline';
import { BillingActionButtons } from '@/components/billing/BillingActionButtons';
import { EntitlementUsageCard } from '@/components/billing/EntitlementUsageCard';
import { UsageAlertsPanel } from '@/components/billing/UsageAlertsPanel';
import { useWorkspaceUsageEntitlements } from '@/hooks/useWorkspaceUsageEntitlements';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Lock, AlertCircle } from 'lucide-react';
import type { Plan, EffectiveMode } from '@/types/billing';

export default function BillingSettings() {
  const { current } = useWorkspace();
  const workspaceId = current?.id;
  const { data: orgAccess } = useMyOrgAccess();
  // TODO(billing-permissions): refinar com `billing.manage` na Fase de backoffice.
  const canMutate = !!orgAccess?.isOrgAdmin;

  const { data: plans = [], isLoading: loadingPlans } = usePlans();
  const { data: subscription, isLoading: loadingSub, error: subError, refetch: refetchSub } =
    useWorkspaceSubscription(workspaceId);
  const { data: invoices = [], isLoading: loadingInvoices } = useWorkspaceInvoices(workspaceId);
  const { data: events = [], isLoading: loadingEvents } = useBillingEvents(workspaceId);

  const createSub = useCreateSubscriptionMock(workspaceId);
  const changePlan = useChangePlanMock(workspaceId);
  const cancelSub = useCancelSubscriptionMock(workspaceId);
  const resumeSub = useResumeSubscriptionMock(workspaceId);

  const currentPlan = useMemo(
    () => plans.find((p) => p.id === subscription?.plan_id) ?? null,
    [plans, subscription?.plan_id],
  );

  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null);
  const [effectiveMode, setEffectiveMode] = useState<EffectiveMode>('immediate');

  const handleSelectPlan = (plan: Plan) => {
    if (!canMutate || !workspaceId) return;
    if (!subscription) {
      // Create subscription directly (with confirmation)
      setPendingPlan(plan);
      setEffectiveMode('immediate');
      return;
    }
    if (plan.id === subscription.plan_id) return;
    setPendingPlan(plan);
    setEffectiveMode('immediate');
  };

  const confirmPlanChange = () => {
    if (!pendingPlan || !workspaceId) return;
    if (!subscription) {
      createSub.mutate(
        { workspaceId, planCode: pendingPlan.code },
        { onSettled: () => setPendingPlan(null) },
      );
    } else {
      changePlan.mutate(
        { workspaceId, newPlanCode: pendingPlan.code, effectiveMode },
        { onSettled: () => setPendingPlan(null) },
      );
    }
  };

  const isUpgrade =
    !!subscription && !!pendingPlan && !!currentPlan &&
    pendingPlan.price_cents > currentPlan.price_cents;

  if (!workspaceId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Selecione um workspace para gerenciar a cobrança.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cobrança</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie seu plano, assinaturas e faturas do workspace.
        </p>
      </header>

      <BillingHomologationBanner />

      {!canMutate && (
        <div className="flex items-start gap-2 p-3 rounded-md border bg-muted/50 text-sm">
          <Lock className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <span>
            Você está visualizando em modo somente leitura. Apenas administradores do
            workspace podem alterar o plano.
          </span>
        </div>
      )}

      {subError && (
        <div className="flex items-center justify-between p-3 rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Não foi possível carregar a assinatura.
          </div>
          <Button size="sm" variant="outline" onClick={() => refetchSub()}>Tentar novamente</Button>
        </div>
      )}

      <BillingSummaryCard
        subscription={subscription ?? null}
        currentPlan={currentPlan}
        loading={loadingSub}
      />

      {subscription && (
        <BillingActionButtons
          subscription={subscription}
          canMutate={canMutate}
          cancelLoading={cancelSub.isPending}
          resumeLoading={resumeSub.isPending}
          onCancel={() => cancelSub.mutate({ workspaceId })}
          onResume={() => resumeSub.mutate({ workspaceId })}
        />
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Planos disponíveis</h2>
          {!subscription && (
            <span className="text-xs text-muted-foreground">
              Escolha um plano para iniciar sua assinatura.
            </span>
          )}
        </div>
        <PlanComparisonGrid
          plans={plans}
          currentPlan={currentPlan}
          loading={loadingPlans}
          mutatingPlanCode={
            changePlan.isPending || createSub.isPending
              ? pendingPlan?.code ?? null
              : null
          }
          disabled={!canMutate}
          onSelectPlan={handleSelectPlan}
        />
      </section>

      <Card>
        <CardHeader><CardTitle className="text-base">Faturas</CardTitle></CardHeader>
        <CardContent><InvoiceTable invoices={invoices} loading={loadingInvoices} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Eventos de cobrança</CardTitle></CardHeader>
        <CardContent><BillingEventsTimeline events={events} loading={loadingEvents} /></CardContent>
      </Card>

      <AlertDialog
        open={!!pendingPlan}
        onOpenChange={(open) => { if (!open) setPendingPlan(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {!subscription
                ? `Iniciar assinatura no plano ${pendingPlan?.name}?`
                : `Mudar para o plano ${pendingPlan?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {!subscription
                ? 'A assinatura será criada imediatamente neste ambiente de homologação.'
                : isUpgrade
                  ? 'Upgrades costumam ter efeito imediato.'
                  : 'Downgrades podem ser aplicados imediatamente ou agendados para o fim do ciclo.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {subscription && (
            <Tabs value={effectiveMode} onValueChange={(v) => setEffectiveMode(v as EffectiveMode)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="immediate">Imediato</TabsTrigger>
                <TabsTrigger value="next_cycle">Próximo ciclo</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmPlanChange(); }}
              disabled={changePlan.isPending || createSub.isPending}
            >
              {changePlan.isPending || createSub.isPending ? 'Processando…' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
