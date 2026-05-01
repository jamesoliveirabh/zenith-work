import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { LogOut, ShieldCheck, LayoutDashboard, Users, Wallet, Lock, LineChart, ShieldAlert, Download, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { logPlatformAdminEvent } from "@/lib/admin/audit";
import { useTrackAdminSession } from "@/hooks/admin/useTrackAdminSession";
import { CanRole } from "@/components/admin-app/RequireRole";
import { cn } from "@/lib/utils";

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  useTrackAdminSession();

  const handleLogout = async () => {
    await logPlatformAdminEvent("logout", { metadata: { email: user?.email } });
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-14 border-b flex items-center px-4 gap-4 bg-card">
        <Link to="/" className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">Platform Backoffice</span>
        </Link>
        <nav className="flex items-center gap-1 ml-4">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              cn(
                "px-3 py-1.5 rounded-md text-sm",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
              )
            }
          >
            <LayoutDashboard className="h-4 w-4 inline mr-1.5" />
            Dashboard
          </NavLink>
          <NavLink
            to="/clients"
            className={({ isActive }) =>
              cn(
                "px-3 py-1.5 rounded-md text-sm",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
              )
            }
          >
            <Users className="h-4 w-4 inline mr-1.5" />
            Clientes
          </NavLink>
          <NavLink
            to="/finance"
            className={({ isActive }) =>
              cn(
                "px-3 py-1.5 rounded-md text-sm",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
              )
            }
          >
            <Wallet className="h-4 w-4 inline mr-1.5" />
            Finance
          </NavLink>
          <NavLink
            to="/metrics"
            className={({ isActive }) =>
              cn(
                "px-3 py-1.5 rounded-md text-sm",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
              )
            }
          >
            <LineChart className="h-4 w-4 inline mr-1.5" />
            Métricas
          </NavLink>
          <CanRole anyOf={["platform_owner", "finance_admin"]}>
            <NavLink
              to="/reconciliation"
              className={({ isActive }) =>
                cn(
                  "px-3 py-1.5 rounded-md text-sm",
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
                )
              }
            >
              <ShieldAlert className="h-4 w-4 inline mr-1.5" />
              Reconciliação
            </NavLink>
          </CanRole>
          <CanRole anyOf={["platform_owner", "finance_admin", "support_admin", "security_admin"]}>
            <NavLink
              to="/exports"
              className={({ isActive }) =>
                cn(
                  "px-3 py-1.5 rounded-md text-sm",
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
                )
              }
            >
              <Download className="h-4 w-4 inline mr-1.5" />
              Exports
            </NavLink>
          </CanRole>
          <CanRole anyOf={["platform_owner", "security_admin", "finance_admin"]}>
            <NavLink
              to="/operations"
              className={({ isActive }) =>
                cn(
                  "px-3 py-1.5 rounded-md text-sm",
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
                )
              }
            >
              <Siren className="h-4 w-4 inline mr-1.5" />
              Ops
            </NavLink>
          </CanRole>
          <CanRole anyOf={["platform_owner", "security_admin", "finance_admin", "support_admin"]}>
            <NavLink
              to="/security/audit"
              className={({ isActive }) =>
                cn(
                  "px-3 py-1.5 rounded-md text-sm",
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
                )
              }
            >
              <Lock className="h-4 w-4 inline mr-1.5" />
              Security
            </NavLink>
          </CanRole>
        </nav>
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground">{user?.email}</div>
        <Button size="sm" variant="ghost" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-1.5" /> Sair
        </Button>
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
