import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { requireAuth, isAuthError, verifyTwinOwner, verifySessionOwner } from '../_shared/healthTwinAuth.ts';
import { normalizeHealthTwinChatResponse } from '../_shared/healthTwinChatResponse.ts';

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const authResult = await requireAuth(req);
    if (isAuthError(authResult)) {
      return new Response(
        JSON.stringify({ error: authResult.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: authResult.status }
      );
    }
    const { user, adminClient: supabaseAdmin } = authResult;

    const payload = await req.json();
    const {
      twin_id,
      session_id,
      message_text,
    } = payload;

    if (!twin_id || !session_id || !message_text) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: twin_id, session_id, message_text' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Verify twin ownership
    const ownsTwin = await verifyTwinOwner(supabaseAdmin, twin_id, user.id);
    if (!ownsTwin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: twin not found or not owned by caller' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Verify session ownership (if existing session, must belong to same twin)
    const ownsSession = await verifySessionOwner(supabaseAdmin, session_id, twin_id);
    if (!ownsSession) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: session belongs to a different twin' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const n8nWebhookUrl =
      Deno.env.get('N8N_HEALTH_TWIN_CHAT_WEBHOOK_URL') ||
      Deno.env.get('N8N_WEBHOOK_CHAT_URL');
    const n8nSecret =
      Deno.env.get('N8N_HEALTH_TWIN_CHAT_WEBHOOK_SECRET') ||
      Deno.env.get('N8N_WEBHOOK_SECRET');

    if (!n8nWebhookUrl || !n8nSecret) {
      console.error('Missing Health Twin chat webhook URL or secret environment variables');
      return new Response(
        JSON.stringify({ error: 'System configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    let normalizedWebhookPath = '';
    try {
      normalizedWebhookPath = new URL(n8nWebhookUrl).pathname.toLowerCase();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid Health Twin chat webhook URL configuration' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (normalizedWebhookPath.includes('trading-agents-run')) {
      return new Response(
        JSON.stringify({ error: 'Health Twin chat webhook is incorrectly pointed to Trading Agents workflow' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const { data: personalDetails, error: personalDetailsError } = await supabaseAdmin
      .from('health_personal_details')
      .select('*')
      .eq('twin_id', twin_id)
      .maybeSingle();
    if (personalDetailsError) {
      console.error('Failed to load authoritative profile context:', personalDetailsError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to load health context' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // 1. Upsert chat session (create if new, update timestamp if existing)
    const { error: sessionErr } = await supabaseAdmin.from('health_chat_sessions').upsert(
      { id: session_id, twin_id: twin_id, active: true },
      { onConflict: 'id' }
    );
    if (sessionErr) {
      console.error('Failed to upsert session:', sessionErr.message);
      return new Response(
        JSON.stringify({ error: 'Failed to initialize chat session' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // 2. Save the user's message and capture the generated ID
    const userMessageId = crypto.randomUUID();
    const { error: userMsgErr } = await supabaseAdmin.from('health_chat_messages').insert([{
      id: userMessageId,
      session_id: session_id,
      role: 'user',
      content: message_text
    }]);
    if (userMsgErr) {
      console.error('Failed to save user message:', userMsgErr.message);
      return new Response(
        JSON.stringify({ error: 'Failed to persist user message' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // 3. Forward the payload securely to n8n's Agent Webhook
    //    Include the user_message_id so n8n can link memories to this message
    //    Use a 5-minute timeout since the Agent may need multiple tool calls
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    let n8nResponse;
    try {
      n8nResponse = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-n8n-secret': n8nSecret,
        },
        body: JSON.stringify({
          twin_id,
          session_id,
          message_text,
          user_message_id: userMessageId,
          personal_details_snapshot: personalDetails || null,
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: 'Agent took too long to respond. Please try a simpler question.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 504 }
        );
      }
      throw fetchError;
    }
    clearTimeout(timeoutId);

    if (!n8nResponse.ok) {
      console.error(`n8n responded with status: ${n8nResponse.status}`);
      const errorText = await n8nResponse.text();
      return new Response(
        JSON.stringify({ error: 'Failed to process chat through agent pipeline', details: errorText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    const parsedResult = await n8nResponse.json();
    const { assistant_reply: assistantReply, widgets } = normalizeHealthTwinChatResponse(parsedResult);

    if (typeof assistantReply !== 'string' || !assistantReply.trim()) {
      console.error('n8n returned an empty or invalid assistant reply');
      return new Response(
        JSON.stringify({ error: 'Agent pipeline returned an invalid response' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    // 4. Save the assistant's reply to the same session (awaited to ensure persistence)
    const { error: assistantMsgErr } = await supabaseAdmin.from('health_chat_messages').insert([{
      session_id: session_id,
      role: 'assistant',
      content: assistantReply,
    }]);
    if (assistantMsgErr) {
      console.error('Failed to persist assistant reply:', assistantMsgErr.message);
      return new Response(
        JSON.stringify({ error: 'Failed to persist assistant message' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // 5. Return the CLEANED response to the frontend
    const cleanResponse = {
      assistant_reply: assistantReply,
      widgets,
      session_id: session_id,
      twin_id: twin_id
    };

    return new Response(
      JSON.stringify(cleanResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Edge Function Error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
