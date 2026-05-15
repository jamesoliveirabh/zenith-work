// Send a Slack message via stored bot token. Called by DB trigger (no JWT) and by clients.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { workspace_id, channel_id, message } = await req.json();
    if (!workspace_id || !message) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: integ, error } = await admin
      .from('workspace_integrations')
      .select('config,is_active,slack_default_channel_id')
      .eq('workspace_id', workspace_id)
      .eq('provider', 'slack')
      .maybeSingle();
    if (error) throw error;
    if (!integ || !integ.is_active) {
      return new Response(JSON.stringify({ ok: false, error: 'Slack not configured' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetChannel = channel_id || (integ as any).slack_default_channel_id;
    if (!targetChannel) {
      return new Response(JSON.stringify({ ok: false, error: 'No channel provided and no default configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: ch } = await admin
      .from('slack_channels')
      .select('channel_id')
      .eq('workspace_id', workspace_id)
      .eq('channel_id', targetChannel)
      .maybeSingle();
    if (!ch) {
      return new Response(JSON.stringify({ ok: false, error: 'Channel not found in workspace. Sync channels first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const botToken = (integ.config as any)?.bot_token;
    if (!botToken) {
      return new Response(JSON.stringify({ ok: false, error: 'Bot token missing' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: targetChannel, text: message }),
    });
    const slack = await slackRes.json();
    if (!slack.ok) {
      return new Response(JSON.stringify({ ok: false, error: slack.error }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
