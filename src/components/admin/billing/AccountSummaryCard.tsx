import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  workspace: Record<string, unknown> | null;
  owner: Record<string, unknown> | null;
}

export function AccountSummaryCard({ workspace, owner }: Props) {
  const id = String(workspace?.id ?? '');
  const copy = () => navigator.clipboard.writeText(id).then(
    () => toast({ title: 'ID copiado' }), () => toast({ title: 'Erro', variant: 'destructive' }));

  return (
    <Card>
      <CardHeader><CardTitle>{(workspace?.name as string) ?? 'Workspace'}</CardTitle></CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="font-mono text-xs truncate">{id}</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={copy}>
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <div><span className="text-muted-foreground">Slug: </span>{(workspace?.slug as string) ?? '—'}</div>
        <div><span className="text-muted-foreground">Owner: </span>{(owner?.display_name as string) ?? (owner?.email as string) ?? '—'}</div>
        <div><span className="text-muted-foreground">Email do owner: </span>{(owner?.email as string) ?? '—'}</div>
      </CardContent>
    </Card>
  );
}
