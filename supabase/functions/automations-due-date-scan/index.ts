// Edge function: automations-due-date-scan
//
// IMPORTANT: This function is invoked DAILY via Supabase Cron (pg_cron + pg_net).
// It scans active automations with trigger = 'due_date_approaching', and for each
// matching task (due_date within the configured window AND not in a "done" status)
// executes the rule's actions — currently only `send_notification` is supported in
// batch mode (other action types depend on row-level triggers).
//
// Schedule (configured in DB via pg_cron):
//   cron: '0 9 * * *'  (every day at 09:00 UTC)
//
// Manual run for debugging: invoke with no body.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const summary = {
    automations_scanned: 0,
    tasks_matched: 0,
    notifications_created: 0,
    runs_logged: 0,
    skipped_recent: 0,
    errors: [] as string[],
  };

  try {
    const { data: rules, error: rulesErr } = await supabase
      .from("automations")
      .select("id, workspace_id, list_id, name, trigger_config, actions, created_by")
      .eq("is_active", true)
      .eq("trigger", "due_date_approaching");
    if (rulesErr) throw rulesErr;

    summary.automations_scanned = rules?.length ?? 0;

    for (const rule of rules ?? []) {
      try {
        const rawDays = Number((rule.trigger_config as any)?.days_before);
        const daysBefore =
          Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 30
            ? Math.floor(rawDays)
            : 3;

        const now = new Date();
        const until = new Date(now.getTime() + daysBefore * 24 * 60 * 60 * 1000);

        // Tasks in workspace, optional list filter, due in window, not "done".
        let q = supabase
          .from("tasks")
          .select("id, title, list_id, assignee_id, due_date, status_id, status:status_columns(is_done)")
          .eq("workspace_id", rule.workspace_id)
          .gte("due_date", now.toISOString())
          .lte("due_date", until.toISOString());
        if (rule.list_id) q = q.eq("list_id", rule.list_id);

        const { data: tasks, error: tasksErr } = await q;
        if (tasksErr) throw tasksErr;

        const pending = (tasks ?? []).filter(
          (t: any) => !t.status || t.status.is_done !== true,
        );
        summary.tasks_matched += pending.length;

        for (const task of pending) {
          // De-dupe: skip if we already logged a successful run for this
          // (automation, task) pair in the last 20 hours.
          const since = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
          const { count: recent } = await supabase
            .from("automation_runs")
            .select("id", { count: "exact", head: true })
            .eq("automation_id", rule.id)
            .eq("task_id", task.id)
            .eq("status", "success")
            .gte("created_at", since);

          if ((recent ?? 0) > 0) {
            summary.skipped_recent++;
            continue;
          }

          const applied: any[] = [];
          for (const action of (rule.actions as any[]) ?? []) {
            if (action?.type !== "send_notification") continue;
            const userId =
              (typeof action.user_id === "string" && action.user_id) ||
              task.assignee_id;
            if (!userId) continue;

            const { error: notifErr } = await supabase.from("notifications").insert({
              workspace_id: rule.workspace_id,
              user_id: userId,
              actor_id: rule.created_by,
              type: "task_assigned",
              task_id: task.id,
              title: `Automação: ${rule.name}`,
              body: `Tarefa: ${task.title}`,
              link_path: `/list/${task.list_id ?? ""}`,
            });
            if (notifErr) {
              summary.errors.push(`notif ${task.id}: ${notifErr.message}`);
              continue;
            }
            summary.notifications_created++;
            applied.push({ type: "send_notification", user_id: userId });
          }

          if (applied.length > 0) {
            await supabase.from("automation_runs").insert({
              automation_id: rule.id,
              workspace_id: rule.workspace_id,
              task_id: task.id,
              status: "success",
              applied_actions: applied,
            });
            await supabase
              .from("automations")
              .update({
                run_count: ((rule as any).run_count ?? 0) + 1,
                last_run_at: new Date().toISOString(),
              })
              .eq("id", rule.id);
            summary.runs_logged++;
          }
        }
      } catch (e) {
        summary.errors.push(`rule ${rule.id}: ${(e as Error).message}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, summary }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
