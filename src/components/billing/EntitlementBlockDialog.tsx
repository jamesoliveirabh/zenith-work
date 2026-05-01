import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ShieldAlert, Lock } from 'lucide-react';
import type { EntitlementCheckResult } from '@/lib/billing/enforcement';
import { FEATURE_REGISTRY } from '@/lib/billing/usage';

interface Props {
  result: EntitlementCheckResult | null;
  onClose: () => void;
  /** Callback chamado ao clicar em "Fazer upgrade" */
  onUpgrade?: () => void;
}

/**
 * Diálogo reutilizável para soft_block / hard_block.
 * Para warn_only, prefira `EntitlementWarningToast`.
 */
export function EntitlementBlockDialog({ result, onClose, onUpgrade }: Props) {
  const navigate = useNavigate();
  const open = !!result && (result.decision === 'soft_blocked' || result.decision === 'hard_blocked');
  if (!result) return null;

  const isHard = result.decision === 'hard_blocked';
  const featureLabel =
    FEATURE_REGISTRY[result.featureKey]?.label ?? result.featureKey;
  const Icon = isHard ? Lock : ShieldAlert;

  const handleUpgrade = () => {
    onClose();
    if (onUpgrade) onUpgrade();
    else navigate('/settings/billing');
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${isHard ? 'text-destructive' : 'text-amber-500'}`} />
            <AlertDialogTitle>
              {isHard ? 'Ação bloqueada' : 'Limite do plano atingido'}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">
            {result.message ??
              'Você atingiu o limite do seu plano para este recurso.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Recurso</span>
            <Badge variant="secondary">{featureLabel}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Uso atual</span>
            <span className="font-medium">
              {result.currentUsage}
              {result.limitValue !== null ? ` / ${result.limitValue}` : ' / Ilimitado'}
            </span>
          </div>
          {result.overrideActive && (
            <div className="text-xs text-amber-600">
              Exceção administrativa ativa para este workspace.
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Agora não</AlertDialogCancel>
          <AlertDialogAction onClick={handleUpgrade}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            Fazer upgrade
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
