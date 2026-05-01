import { useMemo, useState } from 'react';
import { RequirePlatformAdmin } from '@/components/admin/RequirePlatformAdmin';
import { BillingHomologationBanner } from '@/components/billing/BillingHomologationBanner';
import { AdminMetricsTiles } from '@/components/admin/billing/AdminMetricsTiles';
import { AccountFiltersBar } from '@/components/admin/billing/AccountFiltersBar';
import { AccountsTable } from '@/components/admin/billing/AccountsTable';
import { useAdminBillingAccounts, useAdminBillingMetrics } from '@/hooks/useAdminBilling';
import { usePlans } from '@/hooks/useBillingFoundation';
import type { AdminAccountsFilters } from '@/types/admin-billing';

export default function AdminBillingHome() {
  const [filters, setFilters] = useState<AdminAccountsFilters>({ page: 0, pageSize: 25 });
  const { data: plans = [] } = usePlans();
  const { data: accounts, isLoading } = useAdminBillingAccounts(filters);
  const { data: metrics, isLoading: metricsLoading } = useAdminBillingMetrics(30);

  const planCodes = useMemo(() => plans.map((p) => p.code), [plans]);

  return (
    <RequirePlatformAdmin>
      <div className="container mx-auto p-6 space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-semibold">Backoffice de Cobrança</h1>
          <p className="text-sm text-muted-foreground">
            Operação de billing fim-a-fim em homologação.
          </p>
        </div>

        <BillingHomologationBanner />
        <AdminMetricsTiles metrics={metrics} isLoading={metricsLoading} />

        <div className="space-y-3">
          <AccountFiltersBar value={filters} planCodes={planCodes} onChange={setFilters} />
          <AccountsTable
            rows={accounts}
            isLoading={isLoading}
            page={filters.page ?? 0}
            pageSize={filters.pageSize ?? 25}
            onPageChange={(page) => setFilters({ ...filters, page })}
          />
        </div>
      </div>
    </RequirePlatformAdmin>
  );
}
