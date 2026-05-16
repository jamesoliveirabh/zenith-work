
create table if not exists public.technical_debt_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  team_id uuid,
  task_id uuid,
  title text not null,
  description text,
  category text not null check (category in ('refactoring','performance','security','testing','documentation')),
  severity text not null check (severity in ('low','medium','high','critical')),
  estimated_points int,
  impact_score int check (impact_score between 1 and 10),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  due_date date,
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  resolution_sprint_id uuid
);
create index if not exists idx_debt_ws on public.technical_debt_items(workspace_id);
create index if not exists idx_debt_team on public.technical_debt_items(team_id);

-- Extend existing task_dependencies (already has source_task_id/target_task_id)
alter table public.task_dependencies add column if not exists sprint_id uuid;
alter table public.task_dependencies add column if not exists reason text;
alter table public.task_dependencies add column if not exists resolved_at timestamptz;

create table if not exists public.code_review_metrics (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid references public.sprints(id) on delete set null,
  team_id uuid not null,
  "date" date not null,
  total_prs int not null default 0,
  open_prs int not null default 0,
  avg_review_time_hours numeric not null default 0,
  avg_comments_per_pr int not null default 0,
  approvals_required int not null default 0,
  merge_conflicts int not null default 0,
  failed_ci_builds int not null default 0,
  calculated_at timestamptz not null default now(),
  unique(team_id, "date")
);

create table if not exists public.code_quality_metrics (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  sprint_id uuid references public.sprints(id) on delete set null,
  "date" date not null,
  test_coverage_percentage numeric,
  linting_issues int not null default 0,
  code_smells int not null default 0,
  duplicated_lines_percentage numeric not null default 0,
  cyclomatic_complexity numeric not null default 0,
  security_vulnerabilities int not null default 0,
  calculated_at timestamptz not null default now(),
  source text,
  unique(team_id, "date")
);

create table if not exists public.pull_requests_sync (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  task_id uuid,
  pr_id text not null,
  repository text not null,
  pr_number int not null,
  title text,
  author text,
  status text not null check (status in ('open','merged','closed','draft')),
  created_at timestamptz,
  merged_at timestamptz,
  review_count int not null default 0,
  ci_status text check (ci_status in ('pending','success','failure','error')),
  ci_url text,
  synced_at timestamptz not null default now(),
  raw_json jsonb,
  unique(pr_id, repository)
);
create index if not exists idx_pr_task on public.pull_requests_sync(task_id);

create table if not exists public.ci_cd_pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  task_id uuid,
  pr_id text,
  pipeline_id text not null unique,
  status text not null check (status in ('pending','success','failure','cancelled')),
  build_time_seconds int,
  stages jsonb not null default '[]'::jsonb,
  artifacts jsonb not null default '{}'::jsonb,
  triggered_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.service_dependencies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  source_service text not null,
  target_service text not null,
  description text,
  is_optional boolean not null default false,
  health_status text not null default 'unknown' check (health_status in ('healthy','degraded','critical','unknown')),
  last_incident timestamptz,
  created_at timestamptz not null default now(),
  unique(workspace_id, source_service, target_service)
);

create table if not exists public.tech_spikes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  team_id uuid not null,
  task_id uuid,
  title text not null,
  goal text,
  duration_hours int,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','abandoned')),
  started_at timestamptz,
  completed_at timestamptz,
  findings text,
  recommended_action text,
  story_points_to_implement int,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.technical_debt_items enable row level security;
alter table public.code_review_metrics enable row level security;
alter table public.code_quality_metrics enable row level security;
alter table public.pull_requests_sync enable row level security;
alter table public.ci_cd_pipelines enable row level security;
alter table public.service_dependencies enable row level security;
alter table public.tech_spikes enable row level security;

create policy "Members read tech debt" on public.technical_debt_items for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
create policy "Writers insert tech debt" on public.technical_debt_items for insert to authenticated
  with check (can_write_workspace(workspace_id, auth.uid()) and created_by = auth.uid());
create policy "Writers update tech debt" on public.technical_debt_items for update to authenticated
  using (can_write_workspace(workspace_id, auth.uid()));
create policy "Admins delete tech debt" on public.technical_debt_items for delete to authenticated
  using (is_workspace_admin(workspace_id, auth.uid()));

create policy "Members read code review metrics" on public.code_review_metrics for select to authenticated
  using (exists (select 1 from public.teams t where t.id = team_id and is_workspace_member(t.workspace_id, auth.uid())));
create policy "Members read code quality metrics" on public.code_quality_metrics for select to authenticated
  using (exists (select 1 from public.teams t where t.id = team_id and is_workspace_member(t.workspace_id, auth.uid())));

create policy "Members read PRs" on public.pull_requests_sync for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
create policy "Writers insert PRs" on public.pull_requests_sync for insert to authenticated
  with check (can_write_workspace(workspace_id, auth.uid()));
create policy "Writers update PRs" on public.pull_requests_sync for update to authenticated
  using (can_write_workspace(workspace_id, auth.uid()));
create policy "Writers delete PRs" on public.pull_requests_sync for delete to authenticated
  using (can_write_workspace(workspace_id, auth.uid()));

create policy "Members read pipelines" on public.ci_cd_pipelines for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));

create policy "Members read service deps" on public.service_dependencies for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
create policy "Writers insert service deps" on public.service_dependencies for insert to authenticated
  with check (can_write_workspace(workspace_id, auth.uid()));
create policy "Writers update service deps" on public.service_dependencies for update to authenticated
  using (can_write_workspace(workspace_id, auth.uid()));
create policy "Admins delete service deps" on public.service_dependencies for delete to authenticated
  using (is_workspace_admin(workspace_id, auth.uid()));

create policy "Members read spikes" on public.tech_spikes for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
create policy "Writers insert spikes" on public.tech_spikes for insert to authenticated
  with check (can_write_workspace(workspace_id, auth.uid()) and created_by = auth.uid());
create policy "Writers update spikes" on public.tech_spikes for update to authenticated
  using (can_write_workspace(workspace_id, auth.uid()));
create policy "Admins delete spikes" on public.tech_spikes for delete to authenticated
  using (is_workspace_admin(workspace_id, auth.uid()));

drop trigger if exists trg_debt_upd on public.technical_debt_items;
create trigger trg_debt_upd before update on public.technical_debt_items
for each row execute function public.set_updated_at();
drop trigger if exists trg_spike_upd on public.tech_spikes;
create trigger trg_spike_upd before update on public.tech_spikes
for each row execute function public.set_updated_at();
