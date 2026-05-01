import { ReactNode } from 'react';
import { useIsPlatformAdmin } from '@/hooks/usePlatformAdmin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { data: isAdmin, isLoading } = useIsPlatformAdmin();
  if (isLoading) return <Skeleton className="h-32 w-full m-6" />;
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldOff className="h-5 w-5 text-destructive" /> Acesso restrito
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Esta área é destinada ao time interno (platform admin). Se você acredita que
            deveria ter acesso, fale com a equipe de operações.
          </CardContent>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
