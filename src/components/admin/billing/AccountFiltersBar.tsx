import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import type { AdminAccountsFilters } from '@/types/admin-billing';

interface Props {
  value: AdminAccountsFilters;
  planCodes: string[];
  onChange: (v: AdminAccountsFilters) => void;
}

const SUB_STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'incomplete'];
const DUNNING_STATUSES = ['open', 'recovering', 'exhausted'];

const NONE = '__all__';

export function AccountFiltersBar({ value, planCodes, onChange }: Props) {
  const set = (patch: Partial<AdminAccountsFilters>) =>
    onChange({ ...value, ...patch, page: 0 });

  const hasFilters =
    !!value.search || !!value.planCode || !!value.subStatus || !!value.dunningStatus;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[14rem]">
        <Input
          placeholder="Buscar por nome, slug, email ou ID..."
          value={value.search ?? ''}
          onChange={(e) => set({ search: e.target.value })}
        />
      </div>
      <Select
        value={value.planCode ?? NONE}
        onValueChange={(v) => set({ planCode: v === NONE ? undefined : v })}
      >
        <SelectTrigger className="w-[10rem]"><SelectValue placeholder="Plano" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Todos os planos</SelectItem>
          {planCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select
        value={value.subStatus ?? NONE}
        onValueChange={(v) => set({ subStatus: v === NONE ? undefined : v })}
      >
        <SelectTrigger className="w-[10rem]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Todos os status</SelectItem>
          {SUB_STATUSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select
        value={value.dunningStatus ?? NONE}
        onValueChange={(v) => set({ dunningStatus: v === NONE ? undefined : v })}
      >
        <SelectTrigger className="w-[12rem]"><SelectValue placeholder="Dunning" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Todos (dunning)</SelectItem>
          {DUNNING_STATUSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button
          variant="ghost"
          onClick={() => onChange({ page: 0, pageSize: value.pageSize })}
        >
          <X className="h-4 w-4 mr-1" /> Limpar
        </Button>
      )}
    </div>
  );
}
