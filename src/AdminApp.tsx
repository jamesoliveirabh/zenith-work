import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
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
    <ThemeProvider>
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
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default AdminApp;
