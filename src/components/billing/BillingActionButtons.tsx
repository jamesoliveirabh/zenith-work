import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CalendarX, RotateCcw } from 'lucide-react';
import type { WorkspaceSubscription } from '@/types/billing';

interface Props {
  subscription: WorkspaceSubscription | null;
  canMutate: boolean;
  cancelLoading?: boolean;
  resumeLoading?: boolean;
  onCancel: () => void;
  onResume: () => void;
}

export function BillingActionButtons({
  subscription, canMutate, cancelLoading, resumeLoading, onCancel, onResume,
}: Props) {
  if (!subscription) return null;

  const showResume = subscription.cancel_at_period_end;
  const showCancel = !subscription.cancel_at_period_end &&
    subscription.status !== 'canceled';

  return (
    <div className="flex flex-wrap gap-2">
      {showCancel && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={!canMutate || cancelLoading}>
              <CalendarX className="h-4 w-4 mr-2" />
              {cancelLoading ? 'Processando…' : 'Cancelar no fim do ciclo'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
              <AlertDialogDescription>
                Você manterá acesso ao plano atual até o fim do ciclo. Após esse período,
                o workspace voltará ao plano gratuito.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Manter assinatura</AlertDialogCancel>
              <AlertDialogAction onClick={onCancel}>Confirmar cancelamento</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {showResume && (
        <Button size="sm" onClick={onResume} disabled={!canMutate || resumeLoading}>
          <RotateCcw className="h-4 w-4 mr-2" />
          {resumeLoading ? 'Processando…' : 'Reativar assinatura'}
        </Button>
      )}
    </div>
  );
}
