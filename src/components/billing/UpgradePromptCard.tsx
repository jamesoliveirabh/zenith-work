import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  title?: string;
  description?: string;
  ctaLabel?: string;
}

export function UpgradePromptCard({
  title = 'Faça upgrade do seu plano',
  description = 'Libere mais recursos e remova os limites do plano atual.',
  ctaLabel = 'Ver planos',
}: Props) {
  const navigate = useNavigate();
  return (
    <Card className="p-4 flex items-center justify-between gap-4 border-dashed">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      <Button onClick={() => navigate('/settings/billing')}>
        <Sparkles className="h-4 w-4 mr-1.5" /> {ctaLabel}
      </Button>
    </Card>
  );
}
