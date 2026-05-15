import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addDays, format } from "date-fns";
import { useCreateSprint } from "@/hooks/useSprints";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teamId: string;
}

export function SprintFormDialog({ open, onOpenChange, teamId }: Props) {
  const today = new Date();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(format(today, "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(addDays(today, 14), "yyyy-MM-dd"));
  const [goal, setGoal] = useState("");
  const create = useCreateSprint();

  const reset = () => { setName(""); setDescription(""); setGoal(""); };

  const submit = async () => {
    if (!name.trim()) return;
    if (new Date(endDate) < new Date(startDate)) return;
    await create.mutateAsync({
      team_id: teamId, name, description, goal,
      start_date: startDate, end_date: endDate,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova sprint</DialogTitle>
          <DialogDescription>Defina nome, datas e objetivo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 3 — Junho" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Objetivo</Label>
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ex.: Validar login social" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!name.trim() || create.isPending}>Criar sprint</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
