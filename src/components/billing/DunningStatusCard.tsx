import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime } from '@/lib/billing/format';
import type { DunningCase, DunningPolicy } from '@/lib/billing/dunningPolicy';
import { CheckCircle2, AlertCircle, Clock, RefreshCw, CreditCard, XCircle } from 'lucide-react';

interface Props {
  activeCase: DunningCase | null;
  policy: DunningPolicy | null;
  loading?: boolean;
  canMutate?: boolean;
  isSimulating?: boolean;
  isRetrying?: boolean;
  onSimulatePaymentMethod?: () => void;
  onRetryNow?: () => void;
}

const STATUS_LABEL: Record<DunningCase['status'], string> = {
  open: 'Aguardando 1ª tentativa',
  recovering: 'Em recuperação',
  exhausted: 'Tentativas esgotadas',
  recovered: 'Recuperado',
  canceled: 'Cancelado',
};

const STATUS_VARIANT: Record<DunningCase['status'], 'default' | 'destructive' | 'secondary' | 'outline'> = {
  open: 'secondary',
  recovering: 'secondary',
  exhausted: 'destructive',
  recovered: 'default',
  canceled: 'destructive',
};

export function DunningStatusCard({
  activeCase, policy, loading, canMutate,
  isSimulating, isRetrying,
  onSimulatePaymentMethod, onRetryNow,
}: Props) {
  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Status de cobrança</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  if (!activeCase) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Status de cobrança
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sua cobrança está em dia — nenhum caso de inadimplência ativo.
        </CardContent>
      </Card>
    );
  }

  const max = policy?.max_retries ?? 3;
  const used = activeCase.retry_count;
  const pct = Math.min(100, (used / Math.max(1, max)) * 100);

  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          Status de cobrança
          <Badge variant={STATUS_VARIANT[activeCase.status]} className="ml-auto">
            {STATUS_LABEL[activeCase.status]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Tentativas</div>
            <div className="font-medium">{used} / {max}</div>
            <Progress value={pct} className="h-1.5 mt-1" />
          </div>
          <div>
            <div className="text-muted-foreground text-xs flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Próxima tentativa
            </div>
            <div className="font-medium">
              {activeCase.next_retry_at ? formatDateTime(activeCase.next_retry_at) : '—'}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs flex items-center gap-1">
              <Clock className="h-3 w-3" /> Fim da carência
            </div>
            <div className="font-medium">
              {activeCase.grace_ends_at ? formatDate(activeCase.grace_ends_at) : '—'}
            </div>
          </div>
        </div>

        {canMutate && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={onSimulatePaymentMethod} disabled={isSimulating}>
              <CreditCard className="h-4 w-4 mr-1" />
              {isSimulating ? 'Processando…' : 'Simular atualização de pagamento'}
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={onRetryNow} disabled={isRetrying}
              title="Marcar a tentativa atual como paga (somente homologação)"
            >
              {isRetrying ? 'Tentando…' : 'Tentar cobrança agora'}
            </Button>
          </div>
        )}

        {activeCase.status === 'canceled' && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <XCircle className="h-3 w-3" />
            Assinatura cancelada por inadimplência.
          </div>
        )}

        <p className="text-xs text-muted-foreground border-t pt-2">
          Estas ações são <strong>simuladas</strong> em ambiente de homologação. Nenhum
          pagamento real é processado.
        </p>
      </CardContent>
    </Card>
  );
}
