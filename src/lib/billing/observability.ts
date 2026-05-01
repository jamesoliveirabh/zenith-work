/**
 * Phase H9 — Billing observability layer.
 *
 * Lightweight, dependency-free structured logger + in-memory metrics
 * counters scoped to billing/admin/dunning/enforcement events.
 *
 * Designed to be plug-friendly: any future external sink (Datadog, Logflare,
 * OpenTelemetry, Sentry breadcrumbs) can subscribe via `addLogSink` /
 * `addMetricSink` without touching call sites.
 *
 * Sanitization: never log raw PII / payment data. We allow only an allowlist
 * of identifiers + a free-form "context" object that callers must vet.
 */

export type BillingLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type BillingDomain =
  | 'subscription'
  | 'invoice'
  | 'dunning'
  | 'enforcement'
  | 'admin'
  | 'reconciliation'
  | 'health'
  | 'preflight';

export interface BillingLogEvent {
  ts: string;
  level: BillingLogLevel;
  domain: BillingDomain;
  event: string;
  correlation_id: string;
  workspace_id?: string;
  subscription_id?: string;
  invoice_id?: string;
  actor_id?: string;
  message?: string;
  /** Caller-vetted context. MUST NOT contain PII or secrets. */
  context?: Record<string, unknown>;
}

export interface BillingMetricEvent {
  ts: string;
  name: string;
  value: number;
  tags: Record<string, string>;
}

type LogSink = (e: BillingLogEvent) => void;
type MetricSink = (e: BillingMetricEvent) => void;

const SENSITIVE_KEY_PATTERN =
  /(card|cvv|cvc|pan|secret|token|password|authorization|email|phone|cpf|cnpj)/i;

function sanitizeContext(ctx?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!ctx) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      out[k] = '[REDACTED]';
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeContext(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const logSinks: LogSink[] = [];
const metricSinks: MetricSink[] = [];

const recentLogs: BillingLogEvent[] = [];
const recentMetrics: BillingMetricEvent[] = [];
const RING_LIMIT = 500;

const counters = new Map<string, number>();

export function addLogSink(sink: LogSink) {
  logSinks.push(sink);
  return () => {
    const i = logSinks.indexOf(sink);
    if (i >= 0) logSinks.splice(i, 1);
  };
}

export function addMetricSink(sink: MetricSink) {
  metricSinks.push(sink);
  return () => {
    const i = metricSinks.indexOf(sink);
    if (i >= 0) metricSinks.splice(i, 1);
  };
}

export function newCorrelationId(prefix = 'bil'): string {
  // Not crypto-grade; only for log correlation.
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function logBillingEvent(input: Omit<BillingLogEvent, 'ts' | 'context'> & {
  context?: Record<string, unknown>;
}) {
  const evt: BillingLogEvent = {
    ts: new Date().toISOString(),
    ...input,
    context: sanitizeContext(input.context),
  };
  recentLogs.push(evt);
  if (recentLogs.length > RING_LIMIT) recentLogs.shift();
  for (const sink of logSinks) {
    try {
      sink(evt);
    } catch {
      /* observability must never throw */
    }
  }
  // Also mirror to console at the appropriate level for dev visibility.
  const line = `[billing:${evt.domain}] ${evt.event} cid=${evt.correlation_id}` +
    (evt.workspace_id ? ` ws=${evt.workspace_id}` : '');
  switch (evt.level) {
    case 'error':
      console.error(line, evt.context ?? {});
      break;
    case 'warn':
      console.warn(line, evt.context ?? {});
      break;
    case 'debug':
      // eslint-disable-next-line no-console
      console.debug(line, evt.context ?? {});
      break;
    default:
      // eslint-disable-next-line no-console
      console.info(line, evt.context ?? {});
  }
}

export function recordBillingMetric(name: string, value = 1, tags: Record<string, string> = {}) {
  const evt: BillingMetricEvent = {
    ts: new Date().toISOString(),
    name,
    value,
    tags,
  };
  recentMetrics.push(evt);
  if (recentMetrics.length > RING_LIMIT) recentMetrics.shift();
  const key = `${name}|${Object.entries(tags).map(([k, v]) => `${k}=${v}`).sort().join(',')}`;
  counters.set(key, (counters.get(key) ?? 0) + value);
  for (const sink of metricSinks) {
    try {
      sink(evt);
    } catch {
      /* noop */
    }
  }
}

/** Inspect counters (useful for tests + degraded-mode panel). */
export function getBillingCounters(): Record<string, number> {
  return Object.fromEntries(counters.entries());
}

export function getRecentBillingLogs(): BillingLogEvent[] {
  return [...recentLogs];
}

export function getRecentBillingMetrics(): BillingMetricEvent[] {
  return [...recentMetrics];
}

export function resetBillingObservability() {
  recentLogs.length = 0;
  recentMetrics.length = 0;
  counters.clear();
}

/** Convenience helper to time an async operation and emit metric + log. */
export async function instrumentBillingCall<T>(
  args: {
    domain: BillingDomain;
    event: string;
    correlation_id?: string;
    workspace_id?: string;
    actor_id?: string;
    context?: Record<string, unknown>;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const cid = args.correlation_id ?? newCorrelationId();
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    logBillingEvent({
      level: 'info',
      domain: args.domain,
      event: `${args.event}.ok`,
      correlation_id: cid,
      workspace_id: args.workspace_id,
      actor_id: args.actor_id,
      context: { ...args.context, duration_ms: ms },
    });
    recordBillingMetric('billing.call.duration_ms', ms, {
      domain: args.domain,
      event: args.event,
      outcome: 'ok',
    });
    recordBillingMetric('billing.call.count', 1, {
      domain: args.domain,
      event: args.event,
      outcome: 'ok',
    });
    return result;
  } catch (err) {
    const ms = Date.now() - start;
    logBillingEvent({
      level: 'error',
      domain: args.domain,
      event: `${args.event}.error`,
      correlation_id: cid,
      workspace_id: args.workspace_id,
      actor_id: args.actor_id,
      message: err instanceof Error ? err.message : String(err),
      context: { ...args.context, duration_ms: ms },
    });
    recordBillingMetric('billing.call.count', 1, {
      domain: args.domain,
      event: args.event,
      outcome: 'error',
    });
    throw err;
  }
}
