import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/billing/format';

interface Props {
  events: Array<Record<string, unknown>>;
  adminActions: Array<Record<string, unknown>>;
}

interface Item {
  kind: 'event' | 'admin';
  id: string;
  title: string;
  subtitle: string;
  at: string;
  metadata?: unknown;
}

export function BillingTimeline({ events, adminActions }: Props) {
  const items: Item[] = [
    ...events.map((e) => ({
      kind: 'event' as const,
      id: 'e-' + String(e.id),
      title: String(e.event_type),
      subtitle: String(e.provider ?? 'mock'),
      at: String(e.created_at),
      metadata: e.payload,
    })),
    ...adminActions.map((a) => ({
      kind: 'admin' as const,
      id: 'a-' + String(a.id),
      title: String(a.action),
      subtitle: `${String(a.target_type ?? '')} ${String(a.target_id ?? '')}`.trim(),
      at: String(a.created_at),
      metadata: a.metadata,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <Card>
      <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem eventos.</div>
        ) : (
          <ul className="space-y-3">
            {items.slice(0, 80).map((it) => (
              <li key={it.id} className="border-l-2 pl-3 py-1"
                style={{ borderLeftColor: it.kind === 'admin' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground)/0.4)' }}>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant={it.kind === 'admin' ? 'default' : 'secondary'}>
                    {it.kind === 'admin' ? 'admin' : 'evento'}
                  </Badge>
                  <span className="font-medium">{it.title}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{formatDateTime(it.at)}</span>
                </div>
                {it.subtitle && <div className="text-xs text-muted-foreground mt-0.5">{it.subtitle}</div>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
