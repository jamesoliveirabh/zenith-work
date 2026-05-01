import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@/lib/billing/format';
import type { DunningCase } from '@/lib/billing/dunningPolicy';

interface Props {
  activeCase: DunningCase | null;
  hideOnBillingPage?: boolean;
}

/**
 * Global past_due banner — shown across the app when the workspace has an
 * active dunning case. Hidden automatically on the billing settings page.
 */
export function PastDueBanner({ activeCase, hideOnBillingPage = true }: Props) {
  const navigate = useNavigate();
  if (!activeCase) return null;
  if (hideOnBillingPage && typeof window !== 'undefined' && window.location.pathname.startsWith('/settings/billing')) {
    return null;
  }

  const tone = activeCase.status === 'exhausted' ? 'critical' : 'warning';

  return (
    <div
      role="alert"
      className={
        'w-full border-b px-4 py-2 flex flex-wrap items-center gap-3 text-sm ' +
        (tone === 'critical'
          ? 'bg-destructive/10 border-destructive/40 text-destructive'
          : 'bg-amber-500/10 border-amber-500/40 text-amber-900 dark:text-amber-100')
      }
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <strong className="font-medium mr-1">
          {tone === 'critical'
            ? 'Pagamento pendente — sua assinatura pode ser cancelada em breve.'
            : 'Seu pagamento falhou.'}
        </strong>
        <span className="opacity-80">
          {activeCase.grace_ends_at
            ? `Regularize até ${formatDate(activeCase.grace_ends_at)} para evitar interrupção.`
            : 'Atualize seu método para evitar interrupção.'}
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={() => navigate('/settings/billing')}>
        Regularizar agora
      </Button>
    </div>
  );
}
