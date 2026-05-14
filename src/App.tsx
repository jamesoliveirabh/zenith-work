import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider, useWorkspace } from "@/contexts/WorkspaceContext";
import { RequireAuth } from "@/components/RequireAuth";
import { AppLayout } from "@/components/AppLayout";
import AuthPage from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import ListView from "./pages/ListView";
import KanbanView from "./pages/KanbanView";
import TableView from "./pages/TableView";
import CalendarView from "./pages/CalendarView";
import GanttView from "./pages/GanttView";
import ReportsView from "./pages/ReportsView";
import Team from "./pages/Team";
import AcceptInvite from "./pages/AcceptInvite";
import FieldsSettings from "./pages/FieldsSettings";
import Automations from "./pages/Automations";
import Security from "./pages/Security";
import Permissions from "./pages/Permissions";
import ListPermissions from "./pages/ListPermissions";
import ListRolePermissions from "./pages/ListRolePermissions";
import SpacesAdmin from "./pages/SpacesAdmin";
import Goals from "./pages/Goals";
import GoalDetail from "./pages/GoalDetail";
import DocsHome from "./pages/DocsHome";
import DocEditor from "./pages/DocEditor";
import PublishedDoc from "./pages/PublishedDoc";
import TeamsAdmin from "./pages/TeamsAdmin";
import BillingSettings from "./pages/BillingSettings";
import WorkspaceSettings from "./pages/WorkspaceSettings";
import Integrations from "./pages/settings/Integrations";
import AdminBillingHome from "./pages/admin/billing/AdminBillingHome";
import AdminBillingAccountDetail from "./pages/admin/billing/AdminBillingAccountDetail";
import { EntitlementGuardProvider } from "@/components/billing/EntitlementGuardProvider";
import { NotificationCenter } from "@/components/NotificationCenter";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { workspaces, loading } = useWorkspace();
  if (loading) return null;
  if (workspaces.length === 0) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <WorkspaceProvider>
              <EntitlementGuardProvider>
              <NotificationCenter />
              <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/invite/:token" element={<AcceptInvite />} />
                <Route path="/p/:token" element={<PublishedDoc />} />
                <Route
                  path="/onboarding"
                  element={
                    <RequireAuth>
                      <Onboarding />
                    </RequireAuth>
                  }
                />
                <Route
                  element={
                    <RequireAuth>
                      <WorkspaceGate>
                        <AppLayout />
                      </WorkspaceGate>
                    </RequireAuth>
                  }
                >
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/list/:listId" element={<ListView />} />
                  <Route path="/list/:listId/kanban" element={<KanbanView />} />
                  <Route path="/list/:listId/table" element={<TableView />} />
                  <Route path="/list/:listId/calendar" element={<CalendarView />} />
                  <Route path="/list/:listId/gantt" element={<GanttView />} />
                  <Route path="/list/:listId/reports" element={<ReportsView />} />
                  <Route path="/team" element={<Team />} />
                  <Route path="/settings/fields" element={<FieldsSettings />} />
                  <Route path="/automations" element={<Automations />} />
                  <Route path="/teams" element={<TeamsAdmin />} />
                  <Route path="/goals" element={<Goals />} />
                  <Route path="/goals/:goalId" element={<GoalDetail />} />
                  <Route path="/security" element={<Security />} />
                  <Route path="/security/people" element={<Team />} />
                  <Route path="/security/permissions" element={<Permissions />} />
                  <Route path="/security/spaces" element={<SpacesAdmin />} />
                  <Route path="/security/lists/:listId" element={<ListPermissions />} />
                  <Route path="/security/lists/:listId/roles" element={<ListRolePermissions />} />
                  <Route path="/settings/billing" element={<BillingSettings />} />
                  <Route path="/settings/integrations" element={<Integrations />} />
                  <Route path="/admin/billing" element={<AdminBillingHome />} />
                  <Route path="/admin/billing/accounts/:workspaceId" element={<AdminBillingAccountDetail />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
              </EntitlementGuardProvider>
            </WorkspaceProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
    {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
  </QueryClientProvider>
);

export default App;
