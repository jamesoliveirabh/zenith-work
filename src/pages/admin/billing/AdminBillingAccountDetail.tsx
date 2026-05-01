import { useParams, Link } from 'react-router-dom';
import { RequirePlatformAdmin } from '@/components/admin/RequirePlatformAdmin';
import { BillingHomologationBanner } from '@/components/billing/BillingHomologationBanner';
import { useAdminBillingAccountDetail } from '@/hooks/useAdminBilling';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { AccountSummaryCard } from '@/components/admin/billing/AccountSummaryCard';
import { SubscriptionPanel } from '@/components/admin/billing/SubscriptionPanel';
import { InvoicesPanel } from '@/components/admin/billing/InvoicesPanel';
import { DunningPanel } from '@/components/admin/billing/DunningPanel';
import { EntitlementsPanel } from '@/components/admin/billing/EntitlementsPanel';
import { BillingTimeline } from '@/components/admin/billing/BillingTimeline';

export default function AdminBillingAccountDetail() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data, isLoading, error } = useAdminBillingAccountDetail(workspaceId);

  return (
    <RequirePlatformAdmin>
      <div className="container mx-auto p-6 space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/billing"><ChevronLeft className="h-4 w-4 mr-1" />Voltar</Link>
          </Button>
        </div>

        <BillingHomologationBanner />

        {isLoading && <Skeleton className="h-96 w-full" />}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
            Erro ao carregar conta: {(error as Error).message}
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <SubscriptionPanel
                workspaceId={workspaceId!}
                subscription={data.subscription}
                plan={data.plan}
              />
              <InvoicesPanel workspaceId={workspaceId!} invoices={data.invoices} />
              <DunningPanel dunningCase={data.dunning_case} attempts={data.dunning_attempts} />
              <EntitlementsPanel
                workspaceId={workspaceId!}
                entitlements={data.entitlements}
                overrides={data.overrides}
              />
            </div>
            <div className="space-y-6">
              <AccountSummaryCard workspace={data.workspace} owner={data.owner} />
              <BillingTimeline events={data.events} adminActions={data.admin_actions} />
            </div>
          </div>
        )}
      </div>
    </RequirePlatformAdmin>
  );
}
