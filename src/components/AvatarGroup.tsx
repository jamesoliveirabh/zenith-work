import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface AvatarGroupUser {
  user_id: string;
  user_name: string;
  avatar_url?: string | null;
}

interface AvatarGroupProps {
  users: AvatarGroupUser[];
  maxVisible?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
} as const;

export function AvatarGroup({
  users,
  maxVisible = 3,
  size = "sm",
  className,
}: AvatarGroupProps) {
  if (users.length === 0) return null;
  const visible = users.slice(0, maxVisible);
  const hidden = users.slice(maxVisible);
  const sizeClass = SIZE_MAP[size];

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("flex -space-x-1.5 items-center", className)}>
        {visible.map((user) => {
          const initial = (user.user_name || "?").charAt(0).toUpperCase();
          return (
            <Tooltip key={user.user_id}>
              <TooltipTrigger asChild>
                <Avatar
                  className={cn(
                    sizeClass,
                    "ring-2 ring-background bg-muted",
                  )}
                >
                  {user.avatar_url ? (
                    <AvatarImage
                      src={user.avatar_url}
                      alt={user.user_name}
                      className="object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="font-medium">
                    {initial}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="bottom">{user.user_name}</TooltipContent>
            </Tooltip>
          );
        })}

        {hidden.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  sizeClass,
                  "inline-flex items-center justify-center rounded-full ring-2 ring-background bg-muted text-muted-foreground font-medium",
                )}
              >
                +{hidden.length}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {hidden.map((u) => u.user_name).join(", ")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
