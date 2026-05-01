/**
 * Phase P8 — E2E admin scenarios (in-memory fakes).
 *
 * Mirrors the H9 billing scenarios style: deterministic, no Supabase.
 * Validates the contract our admin RPCs and UI mutations rely on:
 *   - suspend / reactivate workspace (with mandatory reason + audit)
 *   - generate invoice + mark paid + dunning lifecycle
 *   - reconciliation fix is idempotent and snapshots before/after
 *   - role grant / revoke writes audit
 *   - kill switch blocks critical mutations
 *   - feature flag set requires reason and is audited
 *
 * Backed by the same SQL contracts shipped in P1–P8 migrations.
 */
import { describe, it, expect, beforeEach } from "vitest";

type Role = "platform_owner" | "finance_admin" | "support_admin" | "security_admin";

interface Workspace { id: string; name: string; suspended: boolean; }
interface Subscription { id: string; workspaceId: string; status: "active"|"past_due"|"canceled"|"trialing"; }
interface Invoice { id: string; workspaceId: string; subscriptionId: string; status: "open"|"paid"|"void"; }
interface DunningCase { id: string; invoiceId: string; status: "open"|"retrying"|"recovered"|"canceled"; attempts: number; }
interface AuditEntry { actor: string; event: string; metadata: Record<string, unknown>; ts: number; }
interface ReconLog { kind: string; before: unknown; after: unknown; reason: string; actor: string; }

class AdminBackofficeFake {
  workspaces = new Map<string, Workspace>();
  subs = new Map<string, Subscription>();
  invoices = new Map<string, Invoice>();
  dunning = new Map<string, DunningCase>();
  audit: AuditEntry[] = [];
  recon: ReconLog[] = [];
  roles = new Map<string, Set<Role>>();
  flags = new Map<string, boolean>([
    ["platform_kill_switch", false],
    ["alerts_enabled", true],
  ]);
  currentActor = "owner@platform";

  private requireReason(reason: string) {
    if (!reason || reason.trim().length < 3) throw new Error("reason required");
  }
  private requireRole(...allowed: Role[]) {
    const r = this.roles.get(this.currentActor) ?? new Set();
    if (!allowed.some((x) => r.has(x))) throw new Error("forbidden");
  }
  private requireNotKilled() {
    if (this.flags.get("platform_kill_switch")) throw new Error("kill_switch_active");
  }
  private log(event: string, metadata: Record<string, unknown> = {}) {
    this.audit.push({ actor: this.currentActor, event, metadata, ts: Date.now() });
  }

  // ===== workspace ops =====
  suspendWorkspace(id: string, reason: string) {
    this.requireRole("platform_owner", "support_admin");
    this.requireNotKilled();
    this.requireReason(reason);
    const w = this.workspaces.get(id); if (!w) throw new Error("not found");
    w.suspended = true;
    this.log("workspace_suspend", { workspace_id: id, reason });
  }
  reactivateWorkspace(id: string, reason: string) {
    this.requireRole("platform_owner", "support_admin");
    this.requireNotKilled();
    this.requireReason(reason);
    const w = this.workspaces.get(id); if (!w) throw new Error("not found");
    w.suspended = false;
    this.log("workspace_reactivate", { workspace_id: id, reason });
  }

  // ===== finance ops =====
  generateInvoice(subId: string, reason: string): Invoice {
    this.requireRole("platform_owner", "finance_admin");
    this.requireNotKilled();
    this.requireReason(reason);
    const sub = this.subs.get(subId); if (!sub) throw new Error("no sub");
    const inv: Invoice = { id: `inv_${this.invoices.size+1}`, workspaceId: sub.workspaceId, subscriptionId: subId, status: "open" };
    this.invoices.set(inv.id, inv);
    this.log("invoice_generate", { invoice_id: inv.id, reason });
    return inv;
  }
  markInvoicePaid(invId: string, reason: string) {
    this.requireRole("platform_owner", "finance_admin");
    this.requireNotKilled();
    this.requireReason(reason);
    const inv = this.invoices.get(invId); if (!inv) throw new Error("no inv");
    inv.status = "paid";
    // close any open dunning for this invoice
    for (const c of this.dunning.values()) {
      if (c.invoiceId === invId && (c.status === "open" || c.status === "retrying")) {
        c.status = "recovered";
      }
    }
    // sub back to active
    const sub = this.subs.get(inv.subscriptionId);
    if (sub && sub.status === "past_due") sub.status = "active";
    this.log("invoice_mark_paid", { invoice_id: invId, reason });
  }

  // ===== reconciliation =====
  scanReconciliation(): { divergences: Array<{ kind: string; entityId: string }> } {
    const divs: Array<{ kind: string; entityId: string }> = [];
    for (const c of this.dunning.values()) {
      const inv = this.invoices.get(c.invoiceId);
      if (inv?.status === "paid" && (c.status === "open" || c.status === "retrying")) {
        divs.push({ kind: "dunning_open_invoice_paid", entityId: c.id });
      }
    }
    return { divergences: divs };
  }
  fixReconciliation(kind: string, entityId: string, reason: string) {
    this.requireRole("platform_owner", "finance_admin");
    this.requireNotKilled();
    this.requireReason(reason);
    if (kind === "dunning_open_invoice_paid") {
      const c = this.dunning.get(entityId);
      if (!c) throw new Error("not found");
      const before = { ...c };
      // idempotent: only act if still open/retrying
      if (c.status === "open" || c.status === "retrying") c.status = "recovered";
      const after = { ...c };
      this.recon.push({ kind, before, after, reason, actor: this.currentActor });
      this.log("reconciliation_fix", { kind, entity_id: entityId, reason });
    }
  }

  // ===== roles =====
  grantRole(user: string, role: Role, reason: string) {
    this.requireRole("platform_owner", "security_admin");
    this.requireNotKilled();
    this.requireReason(reason);
    if (!this.roles.has(user)) this.roles.set(user, new Set());
    this.roles.get(user)!.add(role);
    this.log("role_grant", { user, role, reason });
  }
  revokeRole(user: string, role: Role, reason: string) {
    this.requireRole("platform_owner", "security_admin");
    this.requireReason(reason);
    this.roles.get(user)?.delete(role);
    this.log("role_revoke", { user, role, reason });
  }

  // ===== flags =====
  setFlag(key: string, enabled: boolean, reason: string) {
    this.requireRole("platform_owner", "security_admin");
    this.requireReason(reason);
    if (!this.flags.has(key)) throw new Error("unknown flag");
    const prev = this.flags.get(key);
    this.flags.set(key, enabled);
    this.log("flag_set", { key, from: prev, to: enabled, reason });
  }
}

describe("Phase P8 — admin E2E scenarios", () => {
  let fake: AdminBackofficeFake;
  beforeEach(() => {
    fake = new AdminBackofficeFake();
    fake.roles.set("owner@platform", new Set(["platform_owner"]));
    fake.workspaces.set("w1", { id: "w1", name: "Acme", suspended: false });
    fake.subs.set("s1", { id: "s1", workspaceId: "w1", status: "past_due" });
  });

  it("suspends and reactivates a workspace with mandatory reason and audit", () => {
    fake.suspendWorkspace("w1", "fraud investigation");
    expect(fake.workspaces.get("w1")!.suspended).toBe(true);
    expect(() => fake.suspendWorkspace("w1", "x")).toThrow("reason required");
    fake.reactivateWorkspace("w1", "investigation closed");
    expect(fake.workspaces.get("w1")!.suspended).toBe(false);
    expect(fake.audit.map((a) => a.event)).toEqual(["workspace_suspend", "workspace_reactivate"]);
  });

  it("generates invoice, marks paid, recovers past_due and closes dunning", () => {
    fake.currentActor = "fin@platform";
    fake.roles.set("fin@platform", new Set(["finance_admin"]));
    const inv = fake.generateInvoice("s1", "manual cycle");
    fake.dunning.set("d1", { id: "d1", invoiceId: inv.id, status: "open", attempts: 1 });
    fake.markInvoicePaid(inv.id, "out of band payment confirmed");
    expect(fake.invoices.get(inv.id)!.status).toBe("paid");
    expect(fake.dunning.get("d1")!.status).toBe("recovered");
    expect(fake.subs.get("s1")!.status).toBe("active");
  });

  it("reconciliation flags divergence and fix is idempotent", () => {
    const inv = fake.generateInvoice("s1", "init");
    fake.invoices.get(inv.id)!.status = "paid";
    fake.dunning.set("d2", { id: "d2", invoiceId: inv.id, status: "open", attempts: 0 });
    expect(fake.scanReconciliation().divergences).toHaveLength(1);
    fake.fixReconciliation("dunning_open_invoice_paid", "d2", "auto-clean stale case");
    expect(fake.dunning.get("d2")!.status).toBe("recovered");
    expect(fake.recon).toHaveLength(1);
    // idempotent: re-running fix doesn't double-log a state change
    fake.fixReconciliation("dunning_open_invoice_paid", "d2", "rerun");
    expect(fake.recon[1].before).toEqual(fake.recon[1].after); // no actual change
  });

  it("kill switch blocks critical mutations until disabled", () => {
    fake.setFlag("platform_kill_switch", true, "incident response");
    expect(() => fake.suspendWorkspace("w1", "anything")).toThrow("kill_switch_active");
    expect(() => fake.generateInvoice("s1", "anything")).toThrow("kill_switch_active");
    fake.setFlag("platform_kill_switch", false, "incident closed");
    fake.suspendWorkspace("w1", "now allowed");
    expect(fake.workspaces.get("w1")!.suspended).toBe(true);
  });

  it("flag changes always require a reason and produce audit", () => {
    expect(() => fake.setFlag("alerts_enabled", false, "")).toThrow("reason required");
    fake.setFlag("alerts_enabled", false, "maintenance window");
    const evt = fake.audit.find((a) => a.event === "flag_set")!;
    expect(evt.metadata).toMatchObject({ key: "alerts_enabled", from: true, to: false });
  });

  it("role grant/revoke is gated to platform_owner/security_admin and audited", () => {
    fake.currentActor = "support@platform";
    fake.roles.set("support@platform", new Set(["support_admin"]));
    expect(() => fake.grantRole("u1", "finance_admin", "needs access")).toThrow("forbidden");
    fake.currentActor = "owner@platform";
    fake.grantRole("u1", "finance_admin", "approved by mgmt");
    expect(fake.roles.get("u1")!.has("finance_admin")).toBe(true);
    fake.revokeRole("u1", "finance_admin", "rotation");
    expect(fake.roles.get("u1")!.has("finance_admin")).toBe(false);
    const events = fake.audit.filter((a) => a.event.startsWith("role_")).map((a) => a.event);
    expect(events).toEqual(["role_grant", "role_revoke"]);
  });

  it("non-finance role cannot run finance ops even without kill switch", () => {
    fake.currentActor = "support@platform";
    fake.roles.set("support@platform", new Set(["support_admin"]));
    expect(() => fake.generateInvoice("s1", "x")).toThrow("forbidden");
    expect(() => fake.markInvoicePaid("inv_1", "x")).toThrow("forbidden");
  });
});
