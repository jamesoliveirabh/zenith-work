import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-app/AdminSidebar";
import { useTrackAdminSession } from "@/hooks/admin/useTrackAdminSession";
import { AdminThemeToggle } from "@/components/admin-app/AdminThemeToggle";

const SIDEBAR_PREF_KEY = "platform.sidebar.collapsed";

export function AdminLayout() {
  useTrackAdminSession();

  // Initialize from localStorage (SSR-safe)
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(SIDEBAR_PREF_KEY);
    return v === null ? true : v !== "true";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_PREF_KEY, String(!open));
    } catch {
      /* ignore */
    }
  }, [open]);

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center gap-2 border-b bg-card px-3 sticky top-0 z-10">
            <SidebarTrigger
              className="text-muted-foreground hover:text-foreground"
              aria-label="Alternar menu lateral"
            />
            <div className="text-sm font-medium text-muted-foreground">
              Platform Backoffice
            </div>
            <div className="ml-auto flex items-center gap-1">
              <AdminThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
