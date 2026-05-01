import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ClientFiltersBar } from "@/components/admin-app/clients/ClientFiltersBar";
import { ClientsTable } from "@/components/admin-app/clients/ClientsTable";
import { useClientsList } from "@/hooks/admin/useClients";
import type { ListClientsInput } from "@/lib/admin/clientsService";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 25;

export default function AdminClientsList() {
  const [filters, setFilters] = useState<ListClientsInput>({ limit: PAGE_SIZE, offset: 0 });
  const [planOptions, setPlanOptions] = useState<Array<{ code: string; name: string }>>([]);

  useEffect(() => {
    void supabase
      .from("plans")
      .select("code,name")
      .eq("is_active", true)
      .order("price_cents")
      .then(({ data }) => setPlanOptions((data as { code: string; name: string }[] | null) ?? []));
  }, []);

  const { data: rows = [], isFetching } = useClientsList(filters);
  const total = rows[0]?.total_count ?? 0;
  const offset = filters.offset ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {total} workspace(s) encontrados.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientFiltersBar
            value={filters}
            onChange={(v) => setFilters({ ...v, limit: PAGE_SIZE })}
            planOptions={planOptions}
          />
        </CardContent>
      </Card>

      <ClientsTable rows={rows} loading={isFetching && rows.length === 0} />

      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          Página {page} de {totalPages}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm" variant="outline"
            disabled={offset === 0 || isFetching}
            onClick={() => setFilters({ ...filters, offset: Math.max(0, offset - PAGE_SIZE) })}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <Button
            size="sm" variant="outline"
            disabled={offset + PAGE_SIZE >= total || isFetching}
            onClick={() => setFilters({ ...filters, offset: offset + PAGE_SIZE })}
          >
            Próxima <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
