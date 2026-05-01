import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "icon" | "full";
  className?: string;
}

/**
 * Theme toggle for the Backoffice only. Reads/writes the `backoffice.theme`
 * key via the AdminThemeProvider's next-themes instance.
 */
export function AdminThemeToggle({ variant = "icon", className }: Props) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch / flicker
  useEffect(() => setMounted(true), []);

  const current = (theme === "system" ? resolvedTheme : theme) ?? "dark";
  const isDark = current === "dark";
  const next = isDark ? "light" : "dark";
  const label = isDark ? "Mudar para tema claro" : "Mudar para tema escuro";

  if (variant === "full") {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setTheme(next)}
        aria-label={label}
        className={cn("justify-start", className)}
      >
        {mounted && isDark ? (
          <Sun className="h-4 w-4 mr-1.5" />
        ) : (
          <Moon className="h-4 w-4 mr-1.5" />
        )}
        {mounted ? (isDark ? "Tema claro" : "Tema escuro") : "Tema"}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className={className}
    >
      {mounted && isDark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
