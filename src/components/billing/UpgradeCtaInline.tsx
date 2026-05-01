import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

interface Props {
  variant?: 'inline' | 'block';
  message?: string;
  onUpgrade: () => void;
  disabled?: boolean;
}

export function UpgradeCtaInline({ variant = 'inline', message, onUpgrade, disabled }: Props) {
  if (variant === 'block') {
    return (
      <div className="flex items-center justify-between gap-3 p-3 rounded-md border bg-muted/30">
        <div className="text-sm">
          {message ?? 'Aproxime-se dos limites? Considere fazer um upgrade.'}
        </div>
        <Button size="sm" onClick={onUpgrade} disabled={disabled}>
          <Sparkles className="h-4 w-4 mr-1.5" />
          Fazer upgrade
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={onUpgrade} disabled={disabled}>
      <Sparkles className="h-4 w-4 mr-1.5" />
      Fazer upgrade
    </Button>
  );
}
