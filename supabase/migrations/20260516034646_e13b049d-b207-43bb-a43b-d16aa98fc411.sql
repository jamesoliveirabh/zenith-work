
-- helper if missing
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end$$;

create table if not exists public.retrospectives (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null,
  team_id uuid not null,
  workspace_id uuid not null,
  conducted_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','completed')),
  created_by uuid not null,
  notes text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_retros_sprint on public.retrospectives(sprint_id);
create index if not exists idx_retros_team on public.retrospectives(team_id);

create table if not exists public.retrospective_items (
  id uuid primary key default gen_random_uuid(),
  retrospective_id uuid not null references public.retrospectives(id) on delete cascade,
  category text not null check (category in ('keep','start','stop')),
  content text not null,
  votes int not null default 0,
  is_action_item boolean not null default false,
  assigned_to uuid,
  due_date date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_retro_items_retro on public.retrospective_items(retrospective_id);

create table if not exists public.retrospective_item_votes (
  retrospective_item_id uuid not null references public.retrospective_items(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (retrospective_item_id, user_id)
);

create table if not exists public.sprint_metrics (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  team_id uuid not null,
  "date" date not null,
  points_completed int not null default 0,
  points_in_progress int not null default 0,
  points_remaining int not null default 0,
  velocity_percentage numeric not null default 0,
  avg_points_per_task numeric not null default 0,
  task_completion_rate numeric not null default 0,
  blocked_tasks_count int not null default 0,
  calculated_at timestamptz not null default now(),
  unique(sprint_id, "date")
);
create index if not exists idx_sprint_metrics_sprint on public.sprint_metrics(sprint_id);

create table if not exists public.task_cycle_times (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  created_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  total_days int,
  dev_days int,
  waiting_days int,
  status text,
  calculated_at timestamptz not null default now(),
  unique(sprint_id, task_id)
);

create table if not exists public.sprint_reports (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  team_id uuid not null,
  workspace_id uuid not null,
  generated_at timestamptz not null default now(),
  planned_velocity int,
  actual_velocity int,
  completion_percentage numeric,
  team_members_count int,
  avg_story_points_per_person numeric,
  longest_task_days int,
  blockers_summary text,
  achievements text,
  improvements text,
  report_json jsonb not null default '{}'::jsonb,
  unique(sprint_id)
);

alter table public.retrospectives enable row level security;
alter table public.retrospective_items enable row level security;
alter table public.retrospective_item_votes enable row level security;
alter table public.sprint_metrics enable row level security;
alter table public.task_cycle_times enable row level security;
alter table public.sprint_reports enable row level security;

create policy "Members read retrospectives" on public.retrospectives for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
create policy "Writers create retrospectives" on public.retrospectives for insert to authenticated
  with check (can_write_workspace(workspace_id, auth.uid()) and created_by = auth.uid());
create policy "Writers update retrospectives" on public.retrospectives for update to authenticated
  using (can_write_workspace(workspace_id, auth.uid()));
create policy "Admins delete retrospectives" on public.retrospectives for delete to authenticated
  using (is_workspace_admin(workspace_id, auth.uid()));

create policy "Members read retro items" on public.retrospective_items for select to authenticated
  using (exists (select 1 from public.retrospectives r where r.id = retrospective_id and is_workspace_member(r.workspace_id, auth.uid())));
create policy "Members insert retro items" on public.retrospective_items for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.retrospectives r where r.id = retrospective_id and is_workspace_member(r.workspace_id, auth.uid())));
create policy "Authors or admins update retro items" on public.retrospective_items for update to authenticated
  using (exists (select 1 from public.retrospectives r where r.id = retrospective_id and (retrospective_items.created_by = auth.uid() or is_workspace_admin(r.workspace_id, auth.uid()) or can_write_workspace(r.workspace_id, auth.uid()))));
create policy "Authors or admins delete retro items" on public.retrospective_items for delete to authenticated
  using (exists (select 1 from public.retrospectives r where r.id = retrospective_id and (retrospective_items.created_by = auth.uid() or is_workspace_admin(r.workspace_id, auth.uid()))));

create policy "Members read votes" on public.retrospective_item_votes for select to authenticated
  using (exists (select 1 from public.retrospective_items it join public.retrospectives r on r.id = it.retrospective_id where it.id = retrospective_item_id and is_workspace_member(r.workspace_id, auth.uid())));
create policy "Members add own vote" on public.retrospective_item_votes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.retrospective_items it join public.retrospectives r on r.id = it.retrospective_id where it.id = retrospective_item_id and is_workspace_member(r.workspace_id, auth.uid())));
create policy "Members remove own vote" on public.retrospective_item_votes for delete to authenticated
  using (user_id = auth.uid());

create policy "Members read sprint metrics" on public.sprint_metrics for select to authenticated
  using (exists (select 1 from public.sprints s where s.id = sprint_id and is_workspace_member(s.workspace_id, auth.uid())));
create policy "Members read cycle times" on public.task_cycle_times for select to authenticated
  using (exists (select 1 from public.sprints s where s.id = sprint_id and is_workspace_member(s.workspace_id, auth.uid())));
create policy "Members read sprint reports" on public.sprint_reports for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));

-- Triggers updated_at
drop trigger if exists trg_retros_upd on public.retrospectives;
create trigger trg_retros_upd before update on public.retrospectives for each row execute function public.set_updated_at();
drop trigger if exists trg_retro_items_upd on public.retrospective_items;
create trigger trg_retro_items_upd before update on public.retrospective_items for each row execute function public.set_updated_at();

-- Vote count
create or replace function public.refresh_retro_item_votes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item uuid;
begin
  v_item := coalesce(new.retrospective_item_id, old.retrospective_item_id);
  update public.retrospective_items
    set votes = (select count(*) from public.retrospective_item_votes where retrospective_item_id = v_item)
    where id = v_item;
  return null;
end$$;
drop trigger if exists trg_retro_item_votes on public.retrospective_item_votes;
create trigger trg_retro_item_votes after insert or delete on public.retrospective_item_votes
for each row execute function public.refresh_retro_item_votes();

-- Daily sprint metrics snapshot
create or replace function public.snapshot_sprint_metrics(p_sprint_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_team uuid; v_planned numeric := 0;
  v_total_pts numeric := 0; v_done_pts numeric := 0; v_prog_pts numeric := 0;
  v_total_tasks int := 0; v_done_tasks int := 0; v_avg numeric := 0;
begin
  select team_id, planned_velocity into v_team, v_planned from public.sprints where id = p_sprint_id;
  if v_team is null then return; end if;
  select coalesce(sum(story_points),0),
         coalesce(sum(case when status_in_sprint='done' then story_points else 0 end),0),
         coalesce(sum(case when status_in_sprint='in_progress' then story_points else 0 end),0),
         count(*), count(*) filter (where status_in_sprint='done')
    into v_total_pts, v_done_pts, v_prog_pts, v_total_tasks, v_done_tasks
  from public.sprint_tasks where sprint_id = p_sprint_id;
  if v_total_tasks > 0 then v_avg := v_total_pts / v_total_tasks; end if;
  insert into public.sprint_metrics (sprint_id, team_id, "date", points_completed, points_in_progress, points_remaining, velocity_percentage, avg_points_per_task, task_completion_rate, blocked_tasks_count)
  values (p_sprint_id, v_team, current_date, v_done_pts, v_prog_pts, greatest(0, v_total_pts - v_done_pts),
    case when v_planned > 0 then round((v_done_pts / v_planned)*100, 2) else 0 end,
    round(v_avg, 2),
    case when v_total_tasks > 0 then round((v_done_tasks::numeric / v_total_tasks)*100, 2) else 0 end, 0)
  on conflict (sprint_id, "date") do update set
    points_completed = excluded.points_completed,
    points_in_progress = excluded.points_in_progress,
    points_remaining = excluded.points_remaining,
    velocity_percentage = excluded.velocity_percentage,
    avg_points_per_task = excluded.avg_points_per_task,
    task_completion_rate = excluded.task_completion_rate,
    calculated_at = now();
end$$;

create or replace function public.on_sprint_task_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_started timestamptz; v_completed timestamptz; v_created timestamptz;
begin
  perform public.snapshot_sprint_metrics(coalesce(new.sprint_id, old.sprint_id));
  if tg_op in ('INSERT','UPDATE') then
    v_completed := case when new.status_in_sprint = 'done' then coalesce(new.completed_at, now()) else null end;
    v_started := case when new.status_in_sprint in ('in_progress','done') then coalesce(new.added_at, now()) else null end;
    v_created := new.added_at;
    insert into public.task_cycle_times (task_id, sprint_id, created_at, started_at, completed_at, total_days, dev_days, waiting_days, status)
    values (new.task_id, new.sprint_id, v_created, v_started, v_completed,
      case when v_completed is not null and v_created is not null then extract(day from v_completed - v_created)::int end,
      case when v_completed is not null and v_started is not null then extract(day from v_completed - v_started)::int end,
      case when v_started is not null and v_created is not null then extract(day from v_started - v_created)::int end,
      new.status_in_sprint)
    on conflict (sprint_id, task_id) do update set
      started_at = excluded.started_at, completed_at = excluded.completed_at,
      total_days = excluded.total_days, dev_days = excluded.dev_days, waiting_days = excluded.waiting_days,
      status = excluded.status, calculated_at = now();
  end if;
  return null;
end$$;
drop trigger if exists trg_sprint_task_metrics on public.sprint_tasks;
create trigger trg_sprint_task_metrics after insert or update or delete on public.sprint_tasks
for each row execute function public.on_sprint_task_change();

create or replace function public.generate_sprint_report(p_sprint_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sprint public.sprints%rowtype;
  v_planned int := 0; v_actual int := 0; v_total int := 0; v_done int := 0; v_longest int := 0;
begin
  select * into v_sprint from public.sprints where id = p_sprint_id;
  if v_sprint.id is null then return; end if;
  select coalesce(sum(story_points),0),
         coalesce(sum(case when status_in_sprint='done' then story_points else 0 end),0),
         count(*), count(*) filter (where status_in_sprint='done')
    into v_planned, v_actual, v_total, v_done
  from public.sprint_tasks where sprint_id = p_sprint_id;
  select coalesce(max(total_days),0) into v_longest from public.task_cycle_times where sprint_id = p_sprint_id;
  insert into public.sprint_reports (sprint_id, team_id, workspace_id, planned_velocity, actual_velocity, completion_percentage, team_members_count, avg_story_points_per_person, longest_task_days, report_json)
  values (p_sprint_id, v_sprint.team_id, v_sprint.workspace_id,
    coalesce(v_sprint.planned_velocity, v_planned), v_actual,
    case when v_total > 0 then round((v_done::numeric / v_total)*100, 2) else 0 end,
    0, 0, v_longest,
    jsonb_build_object('total_tasks', v_total, 'done_tasks', v_done, 'planned_points', v_planned, 'actual_points', v_actual))
  on conflict (sprint_id) do update set
    planned_velocity = excluded.planned_velocity, actual_velocity = excluded.actual_velocity,
    completion_percentage = excluded.completion_percentage, longest_task_days = excluded.longest_task_days,
    report_json = excluded.report_json, generated_at = now();
end$$;

create or replace function public.on_sprint_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    perform public.generate_sprint_report(new.id);
  end if;
  return new;
end$$;
drop trigger if exists trg_sprint_completed_report on public.sprints;
create trigger trg_sprint_completed_report after update on public.sprints
for each row execute function public.on_sprint_completed();
