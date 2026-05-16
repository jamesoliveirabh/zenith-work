-- Auto-advance / finalize approval requests when a decision is recorded.
-- Logic:
--   * rejected decision  -> request becomes 'rejected', completed_at = now()
--   * approved decision on a step that has reached its required_approvals count:
--       - if it's the last step  -> request becomes 'approved', completed_at = now()
--       - otherwise               -> current_step_order advances to next step's order
--   * also writes an entry into approval_audit_logs for traceability
create or replace function public.advance_approval_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request    public.approval_requests%rowtype;
  v_step       public.approval_workflow_steps%rowtype;
  v_approved_count int;
  v_next_order int;
  v_from_status public.approval_request_status;
  v_to_status   public.approval_request_status;
begin
  select * into v_request from public.approval_requests where id = new.request_id for update;
  if not found or v_request.status <> 'pending' then
    return new;
  end if;

  v_from_status := v_request.status;

  -- Rejection short-circuits the whole request
  if new.decision = 'rejected' then
    update public.approval_requests
       set status = 'rejected', completed_at = now(), updated_at = now()
     where id = v_request.id;
    v_to_status := 'rejected';
  else
    -- Load the step that received this decision
    select * into v_step from public.approval_workflow_steps where id = new.step_id;
    if not found then
      return new;
    end if;

    select count(*) into v_approved_count
      from public.approval_decisions
     where request_id = v_request.id
       and step_order = v_step.step_order
       and decision = 'approved';

    if v_approved_count >= coalesce(v_step.required_approvals, 1) then
      -- Is there a next step?
      select step_order into v_next_order
        from public.approval_workflow_steps
       where workflow_id = v_step.workflow_id
         and step_order > v_step.step_order
       order by step_order asc
       limit 1;

      if v_next_order is null then
        update public.approval_requests
           set status = 'approved', completed_at = now(), updated_at = now()
         where id = v_request.id;
        v_to_status := 'approved';
      else
        update public.approval_requests
           set current_step_order = v_next_order, updated_at = now()
         where id = v_request.id;
        v_to_status := 'pending';
      end if;
    end if;
  end if;

  if v_to_status is not null and v_to_status is distinct from v_from_status then
    insert into public.approval_audit_logs
      (request_id, workspace_id, actor_id, event_type, from_status, to_status, step_order, metadata)
    values
      (v_request.id, v_request.workspace_id, new.approver_id,
       case when v_to_status = 'rejected' then 'rejected'
            when v_to_status = 'approved' then 'approved'
            else 'step_advanced' end,
       v_from_status, v_to_status, new.step_order,
       jsonb_build_object('decision_id', new.id, 'comment', new.comment));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_advance_approval_on_decision on public.approval_decisions;
create trigger trg_advance_approval_on_decision
after insert on public.approval_decisions
for each row execute function public.advance_approval_request();