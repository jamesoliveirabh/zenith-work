# Runbook — Rollout & rollback do Billing

## Estratégia de rollout (recomendada)
1. **Shadow mode**: produção com `provider=mock` + `enforcementMode=warn_only`.
   Coleta métricas reais sem impactar usuários.
2. **Coorte canário**: ativar `provider=stripe` (quando H10 entregar) para 1-3 workspaces internos.
3. **Expansão por lotes**: 5% → 25% → 50% → 100% dos workspaces, com janela de 24h entre lotes.
4. **Enforcement gradual**: `warn_only` → `soft_block` → `hard_block`, com no mínimo 7 dias entre transições.

## Pré-requisitos para cada lote
- Health badge **Operacional** por 24h consecutivas
- `runBillingPreflight().ok === true`
- Recovery rate de dunning >= 80% no lote anterior
- Zero P1 incidents abertos relacionados a billing

## Rollback imediato (kill-switch)
Se um lote falhar:

1. **Suspender enforcement**:
   ```ts
   setBillingFeatureFlagOverride({ enforcementMode: 'warn_only' });
   ```
2. **Suspender provider real** (volta para mock):
   ```ts
   setBillingFeatureFlagOverride({ provider: 'mock' });
   ```
3. **Kill switch master** (último recurso, desliga billing não-essencial):
   ```ts
   setBillingFeatureFlagOverride({ killSwitch: true });
   ```
4. Notificar `#ops-billing` + abrir incidente.

## Pós-rollback
- Pausar todos os jobs de dunning (`BILLING_DUNNING_ENABLED=false`)
- Snapshot do estado para análise
- Pós-mortem antes de tentar novo rollout

## Validação
- Métricas e alertas voltam ao baseline
- Nenhum tenant em estado inconsistente (verificar via preflight)
- Audit log mostra a sequência de kill-switches aplicados
