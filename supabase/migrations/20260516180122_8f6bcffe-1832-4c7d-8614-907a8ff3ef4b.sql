create or replace function public.decide_approval_request(
  p_request_id uuid,
  p_step_order int,
  p_decision   public.approval_step_decision,
  p_comment    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.approval_requests%rowtype;
  v_step_id uuid;
  v_user    uuid := auth.uid();
  v_ws_id   uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Workspace membership check FIRST (before any lock). Generic "Access denied"
  -- message regardless of whether the request exists, to avoid enumeration.
  select workspace_id into v_ws_id
    from public.approval_requests
   where id = p_request_id;

  if v_ws_id is null or not public.is_workspace_member(v_ws_id, v_user) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  -- Lock the request to serialize concurrent decisions
  select * into v_request
    from public.approval_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'Approval request not found' using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Request is not pending (current status: %)', v_request.status
      using errcode = 'P0001';
  end if;

  if v_request.current_step_order <> p_step_order then
    raise exception 'Wrong step (current: %, given: %)',
      v_request.current_step_order, p_step_order
      using errcode = 'P0001';
  end if;

  select id into v_step_id
    from public.approval_workflow_steps
   where workflow_id = v_request.workflow_id
     and step_order  = p_step_order
   limit 1;

  if v_step_id is null then
    raise exception 'Workflow step not found for order %', p_step_order
      using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.approval_decisions
     where request_id = p_request_id
       and step_order = p_step_order
       and approver_id = v_user
  ) then
    raise exception 'You have already decided this step' using errcode = '23505';
  end if;

  insert into public.approval_decisions
    (request_id, step_id, step_order, approver_id, decision, comment)
  values
    (p_request_id, v_step_id, p_step_order, v_user, p_decision, p_comment);

  select * into v_request from public.approval_requests where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'status', v_request.status,
    'current_step_order', v_request.current_step_order,
    'completed', v_request.completed_at is not null
  );
end;
$$;

grant execute on function public.decide_approval_request(uuid, int, public.approval_step_decision, text) to authenticated;