import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ShieldOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { checkBillingHealth, type BillingHealthReport } from '@/lib/billing/health';
import { getBillingFeatureFlags } from '@/lib/billing/featureFlags';

/**
 * Phase H9 — Admin "degraded mode" health badge.
 *
 * Polls the billing health probe every 60s and renders an at-a-glance status
 * card on the backoffice home. Surfaces flag overrides and component
 * breakdowns to help operators triage incidents quickly.
 */
export function BillingHealthBadge() {
  const [report, setReport] = useState<BillingHealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const flags = getBillingFeatureFlags();

  const refresh = async () => {
    setLoading(true);
    try {
      setReport(await checkBillingHealth());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const overall = report?.overall ?? 'ok';
  const tone =
    overall === 'down'
      ? { icon: ShieldOff, label: 'Indisponível', cls: 'bg-destructive text-destructive-foreground' }
      : overall === 'degraded'
      ? { icon: AlertTriangle, label: 'Degradado', cls: 'bg-yellow-500 text-yellow-950' }
      : { icon: CheckCircle2, label: 'Operacional', cls: 'bg-emerald-500 text-emerald-950' };
  const Icon = tone.icon;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">Saúde do Billing</h3>
          <Badge className={tone.cls}>
            <Icon className="h-3 w-3 mr-1" />
            {tone.label}
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Verificando…' : 'Atualizar'}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {report?.components.map((c) => (
          <div key={c.name} className="border border-border rounded px-2 py-1.5">
            <div className="font-mono text-[11px] text-muted-foreground truncate">{c.name}</div>
            <div className="flex items-center justify-between">
              <span
                className={
                  c.status === 'down'
                    ? 'text-destructive font-medium'
                    : c.status === 'degraded'
                    ? 'text-yellow-600 font-medium'
                    : c.status === 'disabled'
                    ? 'text-muted-foreground'
                    : 'text-emerald-600 font-medium'
                }
              >
                {c.status}
              </span>
              {typeof c.latency_ms === 'number' && (
                <span className="text-muted-foreground">{c.latency_ms}ms</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
        <span>provider: <strong>{flags.provider}</strong></span>
        <span>enforcement: <strong>{flags.enforcementMode}</strong></span>
        <span>dunning: <strong>{flags.dunningEnabled ? 'on' : 'off'}</strong></span>
        <span>admin actions: <strong>{flags.adminActionsEnabled ? 'on' : 'off'}</strong></span>
        {flags.killSwitch && <span className="text-destructive font-semibold">KILL SWITCH ON</span>}
      </div>
    </Card>
  );
}
