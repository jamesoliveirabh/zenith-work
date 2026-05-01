import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "default" | "destructive";
  /** Min length 3, required reason is logged in audit. */
  onConfirm: (reason: string) => Promise<void> | void;
}

export function PlatformAdminActionDialog({
  open, onOpenChange, title, description,
  confirmLabel = "Confirmar", variant = "default", onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      toast.error("Informe um motivo (mínimo 3 caracteres)");
      return;
    }
    setBusy(true);
    try {
      await onConfirm(trimmed);
      toast.success("Ação registrada");
      setReason("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao executar ação");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Motivo (será auditado)</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: Falta de pagamento contínua, ticket #1234"
            maxLength={500}
            rows={3}
            disabled={busy}
          />
          <div className="text-xs text-muted-foreground">{reason.length}/500</div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant={variant} onClick={handleConfirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
