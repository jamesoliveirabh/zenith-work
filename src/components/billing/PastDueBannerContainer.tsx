import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useActiveDunningCase } from '@/hooks/useDunning';
import { PastDueBanner } from './PastDueBanner';

export function PastDueBannerContainer() {
  const { current } = useWorkspace();
  const { data } = useActiveDunningCase(current?.id);
  return <PastDueBanner activeCase={data ?? null} />;
}
