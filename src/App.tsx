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
