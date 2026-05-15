// Sync Slack channels into slack_channels table for a workspace.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsErr || !claims?.claims?.sub) return json({ ok: false, error: 'Unauthorized' }, 401);

    const { workspace_id } = await req.json();
    if (!workspace_id || typeof workspace_id !== 'string') {
      return json({ ok: false, error: 'workspace_id required' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify caller is workspace admin
    const { data: isAdmin } = await admin.rpc('is_workspace_admin', {
      _workspace_id: workspace_id,
      _user_id: claims.claims.sub,
    });
    if (!isAdmin) return json({ ok: false, error: 'Forbidden' }, 403);

    // Get bot token
    const { data: integ, error: iErr } = await admin
      .from('workspace_integrations')
      .select('id,config,is_active')
      .eq('workspace_id', workspace_id)
      .eq('provider', 'slack')
      .maybeSingle();
    if (iErr) throw iErr;
    if (!integ?.is_active) return json({ ok: false, error: 'Slack not connected' }, 400);
    const botToken = (integ.config as any)?.bot_token;
    if (!botToken) return json({ ok: false, error: 'Bot token missing' }, 400);

    // Fetch channels (public + private), paginated
    const all: Array<{ id: string; name: string; is_private?: boolean; is_archived?: boolean }> = [];
    let cursor = '';
    do {
      const url = `https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200&exclude_archived=false${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${botToken}` } });
      const j = await r.json();
      if (!j.ok) return json({ ok: false, error: j.error || 'slack list failed' }, 400);
      for (const c of j.channels || []) all.push(c);
      cursor = j.response_metadata?.next_cursor || '';
    } while (cursor);

    // Replace channels for this workspace
    const { error: delErr } = await admin
      .from('slack_channels')
      .delete()
      .eq('workspace_id', workspace_id);
    if (delErr) throw delErr;

    if (all.length > 0) {
      const rows = all.map((c) => ({
        workspace_id,
        channel_id: c.id,
        channel_name: c.name,
        channel_type: c.is_private ? 'private' : 'public',
        is_archived: !!c.is_archived,
      }));
      const { error: insErr } = await admin.from('slack_channels').insert(rows);
      if (insErr) throw insErr;
    }

    // Mirror in workspace_integrations.config.channels for backward compat
    const newConfig = {
      ...(integ.config as any),
      channels: all.map((c) => ({ id: c.id, name: c.name })),
    };
    await admin.from('workspace_integrations').update({ config: newConfig }).eq('id', integ.id);

    return json({ ok: true, channels_count: all.length });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
