import { PlanCard } from './PlanCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { Plan } from '@/types/billing';

interface Props {
  plans: Plan[];
  currentPlan: Plan | null;
  loading?: boolean;
  mutatingPlanCode?: string | null;
  disabled?: boolean;
  onSelectPlan: (plan: Plan) => void;
}

export function PlanComparisonGrid({
  plans, currentPlan, loading, mutatingPlanCode, disabled, onSelectPlan,
}: Props) {
  if (loading) {
    return (
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 w-full rounded-lg" />)}
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 border rounded-lg text-center">
        Nenhum plano disponível.
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          currentPlan={currentPlan}
          disabled={disabled}
          loading={mutatingPlanCode === plan.code}
          onSelect={() => onSelectPlan(plan)}
        />
      ))}
    </div>
  );
}
