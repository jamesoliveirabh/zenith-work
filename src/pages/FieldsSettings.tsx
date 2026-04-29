import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type FieldType = "text" | "number" | "select" | "checkbox" | "date" | "url";

interface CustomField {
  id: string;
  name: string;
  type: FieldType;
  options: Array<{ label: string }>;
  position: number;
}

const TYPE_LABEL: Record<FieldType, string> = {
  text: "Texto",
  number: "Número",
  select: "Seleção",
  checkbox: "Checkbox",
  date: "Data",
  url: "URL",
};

export default function FieldsSettings() {
  const { user } = useAuth();
  const { current } = useWorkspace();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [myRole, setMyRole] = useState<string | null>(null);

  const isAdmin = myRole === "admin";

  const load = async () => {
    if (!current || !user) return;
    const [{ data: fs }, { data: me }] = await Promise.all([
      supabase.from("custom_fields")
        .select("id,name,type,options,position")
        .eq("workspace_id", current.id)
        .order("position"),
      supabase.from("workspace_members")
        .select("role")
        .eq("workspace_id", current.id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    setFields((fs ?? []) as CustomField[]);
    setMyRole(me?.role ?? null);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id, user?.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !user || !name.trim()) return;
    const options = type === "select"
      ? optionsText.split(",").map((s) => ({ label: s.trim() })).filter((o) => o.label)
      : [];
    if (type === "select" && options.length === 0) {
      toast.error("Adicione ao menos uma opção (separe por vírgula)");
      return;
    }
    const { error } = await supabase.from("custom_fields").insert({
      workspace_id: current.id,
      name: name.trim(),
      type,
      options,
      position: fields.length,
      created_by: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Campo criado");
    setName("");
    setOptionsText("");
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este campo? Os valores armazenados também serão removidos.")) return;
    const { error } = await supabase.from("custom_fields").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Campo excluído");
    load();
  };

  if (!current) return null;

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campos personalizados</h1>
        <p className="text-sm text-muted-foreground">
          Crie campos extras para enriquecer suas tarefas no workspace <strong>{current.name}</strong>.
        </p>
      </div>

      {!isAdmin && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Apenas administradores podem criar ou excluir campos.
        </div>
      )}

      {isAdmin && (
        <form onSubmit={handleCreate} className="rounded-lg border p-4 bg-card space-y-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <Plus className="h-4 w-4" /> Novo campo
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2">
            <div>
              <Label htmlFor="field-name" className="sr-only">Nome</Label>
              <Input
                id="field-name"
                placeholder="Ex: Estimativa, Cliente, Link"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit">Criar</Button>
          </div>
          {type === "select" && (
            <div>
              <Label htmlFor="field-options" className="text-xs">
                Opções (separadas por vírgula)
              </Label>
              <Input
                id="field-options"
                placeholder="Ex: Pequeno, Médio, Grande"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
              />
            </div>
          )}
        </form>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Opções</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{TYPE_LABEL[f.type]}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {f.type === "select" ? f.options.map((o) => o.label).join(", ") : "—"}
                </TableCell>
                <TableCell>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {fields.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                  Nenhum campo personalizado ainda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
