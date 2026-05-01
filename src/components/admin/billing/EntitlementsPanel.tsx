import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { AdminActionDialog } from './AdminActionDialog';
import {
  useAdminApplyEntitlementOverride, useAdminRemoveEntitlementOverride,
} from '@/hooks/useAdminBilling';
import { formatDateTime } from '@/lib/billing/format';

interface Props {
  workspaceId: string;
  entitlements: Array<Record<string, unknown>>;
  overrides: Array<Record<string, unknown>>;
}

const FEATURES = ['members', 'automations', 'storage_gb', 'published_docs', 'active_goals'];

export function EntitlementsPanel({ workspaceId, entitlements, overrides }: Props) {
  const [open, setOpen] = useState(false);
  const [feature, setFeature] = useState<string>('');
  const [mode, setMode] = useState<'warn_only' | 'soft_block' | 'hard_block'>('warn_only');
  const [allowlisted, setAllowlisted] = useState(true);
  const [days, setDays] = useState(30);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const apply = useAdminApplyEntitlementOverride();
  const remove = useAdminRemoveEntitlementOverride();

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Entitlements & Overrides</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Aplicar override</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {entitlements.length > 0 && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Limites</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead>Habilitado</TableHead>
                    <TableHead>Limite</TableHead>
                    <TableHead>Uso atual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entitlements.map((e) => (
                    <TableRow key={String(e.id)}>
                      <TableCell>{String(e.feature_key)}</TableCell>
                      <TableCell>{e.enabled ? 'sim' : 'não'}</TableCell>
                      <TableCell>{e.limit_value === null ? '∞' : String(e.limit_value)}</TableCell>
                      <TableCell>{String(e.current_usage ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {overrides.length > 0 && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Overrides ativos</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Allowlisted</TableHead>
                    <TableHead>Expira</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overrides.map((o) => (
                    <TableRow key={String(o.id)}>
                      <TableCell>{(o.feature_key as string) ?? <em>todas</em>}</TableCell>
                      <TableCell><Badge variant="outline">{String(o.mode ?? '—')}</Badge></TableCell>
                      <TableCell>{o.allowlisted ? 'sim' : 'não'}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(o.override_until as string | null)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setRemoveId(String(o.id))}>
                          Remover
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {entitlements.length === 0 && overrides.length === 0 && (
            <div className="text-sm text-muted-foreground">Sem entitlements ou overrides.</div>
          )}
        </CardContent>
      </Card>

      <AdminActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Aplicar override de entitlement"
        loading={apply.isPending}
        onConfirm={async (reason) => {
          const overrideUntil = days > 0
            ? new Date(Date.now() + days * 24 * 3600 * 1000).toISOString() : null;
          await apply.mutateAsync({
            workspaceId, mode, featureKey: feature || null,
            allowlisted, overrideUntil, reason,
          });
          setOpen(false);
        }}
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Feature (vazio = todas)</Label>
            <Select value={feature || '__all__'} onValueChange={(v) => setFeature(v === '__all__' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {FEATURES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Modo</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="warn_only">warn_only</SelectItem>
                <SelectItem value="soft_block">soft_block</SelectItem>
                <SelectItem value="hard_block">hard_block</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox" id="allowlisted" checked={allowlisted}
              onChange={(e) => setAllowlisted(e.target.checked)}
            />
            <Label htmlFor="allowlisted">Allowlist (forçar warn_only)</Label>
          </div>
          <div className="space-y-1">
            <Label>Validade (dias, 0 = sem expiração)</Label>
            <Input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </div>
        </div>
      </AdminActionDialog>

      <AdminActionDialog
        open={!!removeId}
        onOpenChange={(o) => !o && setRemoveId(null)}
        title="Remover override"
        destructive
        loading={remove.isPending}
        onConfirm={async (reason) => {
          if (!removeId) return;
          await remove.mutateAsync({ overrideId: removeId, reason });
          setRemoveId(null);
        }}
      />
    </>
  );
}
