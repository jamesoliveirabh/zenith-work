import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function BillingHomologationBanner() {
  return (
    <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100">
      <AlertTriangle className="h-4 w-4 !text-amber-600 dark:!text-amber-400" />
      <AlertTitle>Ambiente de homologação</AlertTitle>
      <AlertDescription>
        Nenhuma cobrança real será processada. Todas as ações abaixo são simuladas
        para fins de teste do fluxo de assinatura.
      </AlertDescription>
    </Alert>
  );
}
