import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminThemeProvider } from "@/components/admin-app/AdminThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequirePlatformOwner } from "@/components/admin-app/RequirePlatformOwner";
import { AdminLayout } from "@/pages/admin-app/AdminLayout";
import AdminLogin from "@/pages/admin-app/AdminLogin";
import AdminDashboard from "@/pages/admin-app/AdminDashboard";
import AdminClientsList from "@/pages/admin-app/AdminClientsList";
import AdminClientDetail from "@/pages/admin-app/AdminClientDetail";
import AdminFinanceHome from "@/pages/admin-app/AdminFinanceHome";
import AdminFinanceSubscriptions from "@/pages/admin-app/AdminFinanceSubscriptions";
import AdminFinanceInvoices from "@/pages/admin-app/AdminFinanceInvoices";
import AdminFinanceDunning from "@/pages/admin-app/AdminFinanceDunning";
import AdminMetricsHome from "@/pages/admin-app/AdminMetricsHome";
import AdminMetricsCohorts from "@/pages/admin-app/AdminMetricsCohorts";
import AdminMetricsFunnel from "@/pages/admin-app/AdminMetricsFunnel";
import AdminSecurityUsers from "@/pages/admin-app/AdminSecurityUsers";
import AdminReconciliation from "@/pages/admin-app/AdminReconciliation";
import AdminSecuritySessions from "@/pages/admin-app/AdminSecuritySessions";
import AdminSecurityAudit from "@/pages/admin-app/AdminSecurityAudit";
import AdminExports from "@/pages/admin-app/AdminExports";
import AdminOperations from "@/pages/admin-app/AdminOperations";
import { RequireRole } from "@/components/admin-app/RequireRole";
import NotFound from "@/pages/NotFound";

/**
 * Phase P0 — Platform Owner Backoffice app shell.
 * Mounted only when the current host matches the configured admin host
 * (see src/lib/admin/host.ts). Completely separate route tree from the
 * customer-facing App.tsx — no workspace context, no customer sidebar.
 */

const adminQueryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const AdminApp = () => (
  <QueryClientProvider client={adminQueryClient}>
    <AdminThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<AdminLogin />} />
              <Route
                element={
                  <RequirePlatformOwner>
                    <AdminLayout />
                  </RequirePlatformOwner>
                }
              >
                <Route path="/" element={<AdminDashboard />} />
                <Route path="/clients" element={<AdminClientsList />} />
                <Route path="/clients/:workspaceId" element={<AdminClientDetail />} />
                <Route path="/finance" element={<AdminFinanceHome />} />
                <Route path="/finance/subscriptions" element={<AdminFinanceSubscriptions />} />
                <Route path="/finance/invoices" element={<AdminFinanceInvoices />} />
                <Route path="/finance/dunning" element={<AdminFinanceDunning />} />
                <Route path="/metrics" element={<AdminMetricsHome />} />
                <Route path="/metrics/cohorts" element={<AdminMetricsCohorts />} />
                <Route path="/metrics/funnel" element={<AdminMetricsFunnel />} />
                <Route
                  path="/reconciliation"
                  element={
                    <RequireRole anyOf={["platform_owner", "finance_admin"]}>
                      <AdminReconciliation />
                    </RequireRole>
                  }
                />
                <Route
                  path="/security/admin-users"
                  element={
                    <RequireRole anyOf={["platform_owner", "security_admin"]}>
                      <AdminSecurityUsers />
                    </RequireRole>
                  }
                />
                <Route
                  path="/security/sessions"
                  element={
                    <RequireRole anyOf={["platform_owner", "security_admin"]}>
                      <AdminSecuritySessions />
                    </RequireRole>
                  }
                />
                <Route
                  path="/exports"
                  element={
                    <RequireRole anyOf={["platform_owner", "finance_admin", "support_admin", "security_admin"]}>
                      <AdminExports />
                    </RequireRole>
                  }
                />
                <Route
                  path="/operations"
                  element={
                    <RequireRole anyOf={["platform_owner", "security_admin", "finance_admin"]}>
                      <AdminOperations />
                    </RequireRole>
                  }
                />
                <Route
                  path="/security/audit"
                  element={
                    <RequireRole
                      anyOf={["platform_owner", "security_admin", "finance_admin", "support_admin"]}
                    >
                      <AdminSecurityAudit />
                    </RequireRole>
                  }
                />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </AdminThemeProvider>
  </QueryClientProvider>
);

export default AdminApp;
