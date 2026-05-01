import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  DATASET_LABELS,
  buildCsv,
  downloadCsv,
  type ExportDataset,
  type ExportFilters,
} from "@/lib/admin/exportsService";
import { useExportsLog, useRunExport } from "@/hooks/admin/useExports";
import { formatDateTime } from "@/lib/billing/format";

const DATASETS: ExportDataset[] = ["clients", "subscriptions", "invoices", "dunning", "audit"];

const STATUS_OPTIONS: Record<ExportDataset, string[]> = {
  clients: ["active", "trialing", "past_due", "canceled", "paused"],
  subscriptions: ["active", "trialing", "past_due", "canceled", "paused", "incomplete"],
  invoices: ["open", "paid", "void", "uncollectible", "draft"],
  dunning: ["open", "retrying", "recovered", "failed", "canceled"],
  audit: [],
};

export default function AdminExports() {
  const [dataset, setDataset] = useState<ExportDataset>("clients");
  const [filters, setFilters] = useState<ExportFilters>({});
  const [preview, setPreview] = useState<{ rows: Record<string, unknown>[]; generatedAt: string } | null>(null);
  const runExport = useRunExport();
  const log = useExportsLog();

  const statusOptions = STATUS_OPTIONS[dataset];

  const update = (patch: Partial<ExportFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const handleRun = async (download: boolean) => {
    try {
      const result = await runExport.mutateAsync({ dataset, filters });
      setPreview({ rows: result.rows, generatedAt: result.generatedAt });
      if (download) {
        const csv = buildCsv({
          dataset,
          rows: result.rows,
          filters,
          generatedAt: result.generatedAt,
        });
        const ts = result.generatedAt.replace(/[:.]/g, "-");
        downloadCsv(`${dataset}_${ts}.csv`, csv);
        toast.success(`Export gerado: ${result.rows.length} linhas`);
      } else {
        toast.success(`Preview pronto: ${result.rows.length} linhas`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar export");
    }
  };

  const previewHeaders = useMemo(() => {
    if (!preview || preview.rows.length === 0) return [];
    return Object.keys(preview.rows[0]).slice(0, 8);
  }, [preview]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
          Exports
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Geração de CSV operacional/financeiro para BI e contabilidade. Toda exportação é auditada.
        </p>
      </div>

      <Tabs defaultValue="generate">
        <TabsList>
          <TabsTrigger value="generate">Gerar export</TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1.5" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>
                Selecione o dataset e refine. O CSV inclui metadata (generated_at, filtros aplicados).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Dataset</Label>
                <Select
                  value={dataset}
                  onValueChange={(v) => {
                    setDataset(v as ExportDataset);
                    setFilters({});
                    setPreview(null);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DATASETS.map((d) => (
                      <SelectItem key={d} value={d}>{DATASET_LABELS[d]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Busca (nome, email, id)</Label>
                <Input
                  placeholder="Filtro livre..."
                  value={filters.search ?? ""}
                  onChange={(e) => update({ search: e.target.value })}
                />
              </div>

              {dataset !== "audit" ? (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={filters.status ?? "__all__"}
                    onValueChange={(v) => update({ status: v === "__all__" ? undefined : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Evento</Label>
                  <Input
                    placeholder="ex: login, role_grant..."
                    value={filters.event ?? ""}
                    onChange={(e) => update({ event: e.target.value })}
                  />
                </div>
              )}

              {(dataset === "clients" || dataset === "subscriptions") && (
                <div className="space-y-2">
                  <Label>Plano (code)</Label>
                  <Input
                    placeholder="free, pro, business..."
                    value={filters.planCode ?? ""}
                    onChange={(e) => update({ planCode: e.target.value })}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Criado após</Label>
                <Input
                  type="date"
                  value={filters.createdAfter?.slice(0, 10) ?? ""}
                  onChange={(e) =>
                    update({ createdAfter: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Criado antes</Label>
                <Input
                  type="date"
                  value={filters.createdBefore?.slice(0, 10) ?? ""}
                  onChange={(e) =>
                    update({ createdBefore: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button onClick={() => handleRun(false)} variant="outline" disabled={runExport.isPending}>
              {runExport.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Pré-visualizar
            </Button>
            <Button onClick={() => handleRun(true)} disabled={runExport.isPending}>
              {runExport.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1.5" />
              )}
              Baixar CSV
            </Button>
          </div>

          {preview && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Preview
                  <Badge variant="secondary">{preview.rows.length} linhas</Badge>
                </CardTitle>
                <CardDescription>
                  Gerado em {formatDateTime(preview.generatedAt)} — exibindo até 25 linhas e 8 colunas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {preview.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum resultado para os filtros aplicados.</p>
                ) : (
                  <div className="overflow-auto border rounded-md max-h-[480px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {previewHeaders.map((h) => (
                            <TableHead key={h} className="text-xs">{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.rows.slice(0, 25).map((r, i) => (
                          <TableRow key={i}>
                            {previewHeaders.map((h) => (
                              <TableCell key={h} className="text-xs font-mono max-w-[220px] truncate">
                                {r[h] === null || r[h] === undefined
                                  ? "—"
                                  : typeof r[h] === "object"
                                    ? JSON.stringify(r[h])
                                    : String(r[h])}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de exportações</CardTitle>
              <CardDescription>Todas as exportações executadas (UI ou API).</CardDescription>
            </CardHeader>
            <CardContent>
              {log.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : (
                <div className="overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead>
                        <TableHead>Dataset</TableHead>
                        <TableHead>Linhas</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Autor</TableHead>
                        <TableHead>Filtros</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(log.data ?? []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs">{formatDateTime(row.created_at)}</TableCell>
                          <TableCell><Badge variant="outline">{row.dataset}</Badge></TableCell>
                          <TableCell>{row.row_count}</TableCell>
                          <TableCell><Badge variant="secondary">{row.source}</Badge></TableCell>
                          <TableCell className="text-xs">{row.actor_email ?? "—"}</TableCell>
                          <TableCell className="text-xs font-mono max-w-[400px] truncate">
                            {JSON.stringify(row.filters)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(log.data ?? []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground text-sm">
                            Nenhuma exportação registrada ainda.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
