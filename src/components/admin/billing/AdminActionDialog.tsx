import { ReactNode, useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Extra fields to render between description and reason. */
  children?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** When set, requires the user to type this exact phrase to enable the confirm button. */
  confirmPhrase?: string;
  loading?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
}

export function AdminActionDialog({
  open, onOpenChange, title, description, children,
  confirmLabel = 'Confirmar', destructive, confirmPhrase, loading,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');

  useEffect(() => {
    if (!open) { setReason(''); setPhrase(''); }
  }, [open]);

  const reasonOk = reason.trim().length >= 4;
  const phraseOk = !confirmPhrase || phrase.trim() === confirmPhrase;
  const canConfirm = reasonOk && phraseOk && !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {children}

          <div className="space-y-2">
            <Label htmlFor="admin-reason">Motivo (obrigatório)</Label>
            <Textarea
              id="admin-reason"
              placeholder="Descreva o motivo desta ação para a trilha de auditoria..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          {confirmPhrase && (
            <div className="space-y-2">
              <Label htmlFor="confirm-phrase">
                Para confirmar, digite <code className="px-1 rounded bg-muted text-foreground">{confirmPhrase}</code>
              </Label>
              <input
                id="confirm-phrase"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={!canConfirm}
            onClick={() => onConfirm(reason.trim())}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
