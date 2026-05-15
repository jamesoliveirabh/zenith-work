
-- SPRINTS
create table if not exists public.sprints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'planning' check (status in ('planning','active','completed','archived')),
  start_date date not null,
  end_date date not null,
  goal text,
  planned_velocity int not null default 0,
  actual_velocity int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  is_deleted boolean not null default false,
  constraint sprints_valid_dates check (end_date >= start_date)
);

create index if not exists idx_sprints_team on public.sprints(team_id) where is_deleted = false;
create index if not exists idx_sprints_workspace on public.sprints(workspace_id) where is_deleted = false;
create unique index if not exists uq_sprints_one_active_per_team
  on public.sprints(team_id) where status = 'active' and is_deleted = false;

alter table public.sprints enable row level security;

create policy "Members read sprints"
  on public.sprints for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));

create policy "Admins create sprints"
  on public.sprints for insert to authenticated
  with check (is_workspace_admin(workspace_id, auth.uid()) and created_by = auth.uid());

create policy "Admins update sprints"
  on public.sprints for update to authenticated
  using (is_workspace_admin(workspace_id, auth.uid()));

create policy "Admins delete sprints"
  on public.sprints for delete to authenticated
  using (is_workspace_admin(workspace_id, auth.uid()));

-- SPRINT TASKS
create table if not exists public.sprint_tasks (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  story_points int check (story_points is null or story_points in (1,2,3,5,8,13,21)),
  "order" int not null default 0,
  status_in_sprint text not null default 'todo' check (status_in_sprint in ('todo','in_progress','done')),
  added_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(sprint_id, task_id)
);

create index if not exists idx_sprint_tasks_sprint on public.sprint_tasks(sprint_id);
create index if not exists idx_sprint_tasks_task on public.sprint_tasks(task_id);

alter table public.sprint_tasks enable row level security;

create policy "Members read sprint_tasks"
  on public.sprint_tasks for select to authenticated
  using (exists (
    select 1 from public.sprints s
    where s.id = sprint_tasks.sprint_id
      and is_workspace_member(s.workspace_id, auth.uid())
  ));

create policy "Admins insert sprint_tasks"
  on public.sprint_tasks for insert to authenticated
  with check (exists (
    select 1 from public.sprints s
    where s.id = sprint_tasks.sprint_id
      and is_workspace_admin(s.workspace_id, auth.uid())
  ));

create policy "Members update sprint_tasks"
  on public.sprint_tasks for update to authenticated
  using (exists (
    select 1 from public.sprints s
    where s.id = sprint_tasks.sprint_id
      and is_workspace_member(s.workspace_id, auth.uid())
  ));

create policy "Admins delete sprint_tasks"
  on public.sprint_tasks for delete to authenticated
  using (exists (
    select 1 from public.sprints s
    where s.id = sprint_tasks.sprint_id
      and is_workspace_admin(s.workspace_id, auth.uid())
  ));

-- VELOCITY HISTORY
create table if not exists public.velocity_history (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  planned_velocity int not null default 0,
  actual_velocity int not null default 0,
  completion_rate numeric not null default 0,
  created_at timestamptz not null default now(),
  unique(sprint_id)
);

create index if not exists idx_velocity_history_team on public.velocity_history(team_id);

alter table public.velocity_history enable row level security;

create policy "Members read velocity_history"
  on public.velocity_history for select to authenticated
  using (exists (
    select 1 from public.teams t
    where t.id = velocity_history.team_id
      and is_workspace_member(t.workspace_id, auth.uid())
  ));

-- TRIGGERS
create or replace function public.touch_sprints_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sprints_touch on public.sprints;
create trigger trg_sprints_touch before update on public.sprints
  for each row execute function public.touch_sprints_updated_at();

-- Set completed_at when sprint_task moves to done
create or replace function public.handle_sprint_task_status()
returns trigger language plpgsql as $$
begin
  if new.status_in_sprint = 'done' and (old.status_in_sprint is distinct from 'done') then
    new.completed_at = now();
  elsif new.status_in_sprint <> 'done' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sprint_task_status on public.sprint_tasks;
create trigger trg_sprint_task_status before update on public.sprint_tasks
  for each row execute function public.handle_sprint_task_status();

-- When sprint completes: compute actual velocity + insert velocity_history
create or replace function public.handle_sprint_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actual int;
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    select coalesce(sum(story_points), 0) into v_actual
      from public.sprint_tasks
      where sprint_id = new.id and status_in_sprint = 'done';

    new.actual_velocity = v_actual;

    insert into public.velocity_history(team_id, sprint_id, planned_velocity, actual_velocity, completion_rate)
    values (
      new.team_id,
      new.id,
      new.planned_velocity,
      v_actual,
      case when new.planned_velocity > 0 then round((v_actual::numeric / new.planned_velocity) * 100, 2) else 0 end
    )
    on conflict (sprint_id) do update set
      planned_velocity = excluded.planned_velocity,
      actual_velocity = excluded.actual_velocity,
      completion_rate = excluded.completion_rate;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sprint_completion on public.sprints;
create trigger trg_sprint_completion before update on public.sprints
  for each row execute function public.handle_sprint_completion();
