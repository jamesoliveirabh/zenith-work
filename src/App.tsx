import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import Team from "./pages/Team";
import AcceptInvite from "./pages/AcceptInvite";
import FieldsSettings from "./pages/FieldsSettings";
import Automations from "./pages/Automations";
import Security from "./pages/Security";
import Permissions from "./pages/Permissions";
import ListPermissions from "./pages/ListPermissions";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

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
              <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/invite/:token" element={<AcceptInvite />} />
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
                  <Route path="/team" element={<Team />} />
                  <Route path="/settings/fields" element={<FieldsSettings />} />
                  <Route path="/automations" element={<Automations />} />
                  <Route path="/security" element={<Security />} />
                  <Route path="/security/people" element={<Team />} />
                  <Route path="/security/permissions" element={<Permissions />} />
                  <Route path="/security/lists/:listId" element={<ListPermissions />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </WorkspaceProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
