import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { formatDateTime } from '@/lib/billing/format';
import type { DunningAttempt } from '@/lib/billing/dunningPolicy';

interface Props {
  attempts: DunningAttempt[];
  loading?: boolean;
}

const ICONS = {
  paid: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  skipped: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
};

export function DunningTimeline({ attempts, loading }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Histórico de tentativas</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma tentativa registrada ainda.</p>
        ) : (
          <ol className="space-y-3">
            {attempts.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <div className="mt-0.5">{ICONS[a.result]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Tentativa #{a.attempt_number}</span>
                    <Badge variant="outline" className="text-xs uppercase">{a.result}</Badge>
                    <span className="text-muted-foreground text-xs">{formatDateTime(a.attempted_at)}</span>
                  </div>
                  {a.reason && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.reason}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
