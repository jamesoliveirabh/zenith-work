import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Wallet,
  LineChart,
  ShieldAlert,
  Download,
  Siren,
  Lock,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { logPlatformAdminEvent } from "@/lib/admin/audit";
import { Button } from "@/components/ui/button";
import { CanRole } from "@/components/admin-app/RequireRole";
import type { PlatformRole } from "@/lib/admin/securityService";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  roles?: PlatformRole[];
};

export const adminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, end: true },
  { label: "Clientes", href: "/clients", icon: Users },
  { label: "Finance", href: "/finance", icon: Wallet },
  { label: "Métricas", href: "/metrics", icon: LineChart },
  {
    label: "Reconciliação",
    href: "/reconciliation",
    icon: ShieldAlert,
    roles: ["platform_owner", "finance_admin"],
  },
  {
    label: "Exports",
    href: "/exports",
    icon: Download,
    roles: ["platform_owner", "finance_admin", "support_admin", "security_admin"],
  },
  {
    label: "Ops",
    href: "/operations",
    icon: Siren,
    roles: ["platform_owner", "security_admin", "finance_admin"],
  },
  {
    label: "Security",
    href: "/security/audit",
    icon: Lock,
    roles: ["platform_owner", "security_admin", "finance_admin", "support_admin"],
  },
];

export function AdminSidebar() {
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const env = import.meta.env.MODE === "production" ? "PROD" : "HML";

  const handleLogout = async () => {
    await logPlatformAdminEvent("logout", { metadata: { email: user?.email } });
    await signOut();
    navigate("/login", { replace: true });
  };

  const isActive = (href: string, end?: boolean) =>
    end ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item.href, item.end);
    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={collapsed ? item.label : undefined}
        >
          <NavLink
            to={item.href}
            end={item.end}
            onClick={() => setOpenMobile(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2",
              active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary/10">
            <ShieldCheck className="h-5 w-5 text-sidebar-primary" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold tracking-tight truncate">
                Platform Backoffice
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {env}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Navegação</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {adminNavItems.map((item) =>
                item.roles ? (
                  <CanRole key={item.href} anyOf={item.roles}>
                    {renderItem(item)}
                  </CanRole>
                ) : (
                  renderItem(item)
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed ? (
          <div className="flex flex-col gap-2 p-2">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium truncate">{user?.email ?? "Admin"}</span>
              <span className="text-[10px] text-muted-foreground">Admin signed in</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleLogout}
              className="justify-start"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4 mr-1.5" /> Sair
            </Button>
          </div>
        ) : (
          <div className="flex justify-center p-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={handleLogout}
              aria-label="Sair"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
