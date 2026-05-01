import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Search } from "lucide-react";
import type { ListClientsInput } from "@/lib/admin/clientsService";

interface Props {
  value: ListClientsInput;
  onChange: (v: ListClientsInput) => void;
  planOptions: Array<{ code: string; name: string }>;
}

const SUB_STATUSES = ["trialing", "active", "past_due", "canceled", "paused"];

export function ClientFiltersBar({ value, onChange, planOptions }: Props) {
  const [search, setSearch] = useState(value.search ?? "");

  // Debounce search input → 350ms
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== (value.search ?? "")) {
        onChange({ ...value, search, offset: 0 });
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="grid gap-3 md:grid-cols-6 items-end">
      <div className="md:col-span-2">
        <Label htmlFor="search" className="text-xs">Busca</Label>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="search"
            className="pl-8"
            placeholder="Nome, email, slug ou ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Plano</Label>
        <Select
          value={value.planCode ?? "__all__"}
          onValueChange={(v) => onChange({ ...value, planCode: v === "__all__" ? undefined : v, offset: 0 })}
        >
          <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {planOptions.map((p) => (
              <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">Status assinatura</Label>
        <Select
          value={value.subStatus ?? "__all__"}
          onValueChange={(v) => onChange({ ...value, subStatus: v === "__all__" ? undefined : v, offset: 0 })}
        >
          <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {SUB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">Criado a partir de</Label>
        <Input
          type="date"
          value={value.createdAfter?.slice(0, 10) ?? ""}
          onChange={(e) => onChange({
            ...value,
            createdAfter: e.target.value ? new Date(e.target.value).toISOString() : null,
            offset: 0,
          })}
        />
      </div>

      <div className="flex items-center gap-2 pb-2">
        <Switch
          id="suspended"
          checked={!!value.suspendedOnly}
          onCheckedChange={(c) => onChange({ ...value, suspendedOnly: c, offset: 0 })}
        />
        <Label htmlFor="suspended" className="text-xs">Só suspensos</Label>
      </div>
    </div>
  );
}
