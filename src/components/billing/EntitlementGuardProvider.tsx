import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { EntitlementBlockDialog } from '@/components/billing/EntitlementBlockDialog';
import { showEntitlementWarningToast } from '@/components/billing/EntitlementWarningToast';
import { EntitlementBlockedError, type EntitlementCheckResult } from '@/lib/billing/enforcement';

interface Ctx {
  /** Mostra UI apropriada (toast ou dialog) para o resultado. */
  handleResult: (r: EntitlementCheckResult) => void;
  /** Captura erro de mutation; retorna true se tratou. */
  handleError: (err: unknown) => boolean;
  /** Abre o diálogo de bloqueio explicitamente. */
  showBlock: (r: EntitlementCheckResult) => void;
}

const EntitlementGuardContext = createContext<Ctx | null>(null);

export function EntitlementGuardProvider({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState<EntitlementCheckResult | null>(null);

  const showBlock = useCallback((r: EntitlementCheckResult) => setBlocked(r), []);

  const handleResult = useCallback((r: EntitlementCheckResult) => {
    if (r.decision === 'warned') {
      showEntitlementWarningToast(r);
      return;
    }
    if (r.decision === 'soft_blocked' || r.decision === 'hard_blocked') {
      setBlocked(r);
    }
  }, []);

  const handleError = useCallback((err: unknown): boolean => {
    if (err instanceof EntitlementBlockedError) {
      setBlocked(err.result);
      return true;
    }
    return false;
  }, []);

  return (
    <EntitlementGuardContext.Provider value={{ handleResult, handleError, showBlock }}>
      {children}
      <EntitlementBlockDialog result={blocked} onClose={() => setBlocked(null)} />
    </EntitlementGuardContext.Provider>
  );
}

export function useEntitlementGuard(): Ctx {
  const ctx = useContext(EntitlementGuardContext);
  if (!ctx) {
    // Fallback no-op para componentes fora do provider (ex.: testes)
    return {
      handleResult: () => {},
      handleError: () => false,
      showBlock: () => {},
    };
  }
  return ctx;
}
