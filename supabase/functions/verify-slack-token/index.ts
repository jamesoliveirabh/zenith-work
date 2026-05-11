// Verify a Slack bot token and fetch channels
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const raw = (await req.json())?.bot_token;
    const bot_token = typeof raw === 'string' ? raw.trim() : '';
    if (!bot_token || !/^xox[bpose]-/.test(bot_token)) {
      return new Response(JSON.stringify({ valid: false, error: 'Token inválido. Use um Bot Token (xoxb-...) ou User Token (xoxp-...).' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authRes = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bot_token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const auth = await authRes.json();
    if (!auth.ok) {
      return new Response(JSON.stringify({ valid: false, error: auth.error || 'auth.test failed' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chRes = await fetch(
      'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200&exclude_archived=true',
      { headers: { Authorization: `Bearer ${bot_token}` } },
    );
    const ch = await chRes.json();
    const channels = (ch.channels || []).map((c: any) => ({ id: c.id, name: c.name }));

    return new Response(JSON.stringify({
      valid: true,
      team_name: auth.team,
      team_id: auth.team_id,
      channels,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ valid: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
