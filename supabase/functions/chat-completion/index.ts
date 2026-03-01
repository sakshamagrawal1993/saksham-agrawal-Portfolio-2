import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { 
      twin_id, 
      session_id, 
      message_text, 
      personal_details_snapshot 
    } = payload;

    if (!twin_id || !session_id || !message_text) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: twin_id, session_id, message_text' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL');
    const n8nSecret = Deno.env.get('N8N_WEBHOOK_SECRET');

    if (!n8nWebhookUrl || !n8nSecret) {
      console.error('Missing N8N_WEBHOOK_URL or N8N_WEBHOOK_SECRET environment variables');
      return new Response(
        JSON.stringify({ error: 'System configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Initialize Supabase Admin client (bypasses RLS with service role key)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Upsert chat session (create if new, update timestamp if existing)
    await supabaseAdmin.from('health_chat_sessions').upsert(
      { id: session_id, twin_id: twin_id, active: true },
      { onConflict: 'id' }
    );

    // 2. Save the user's message and capture the generated ID
    const userMessageId = crypto.randomUUID();
    await supabaseAdmin.from('health_chat_messages').insert([{
      id: userMessageId,
      session_id: session_id,
      role: 'user',
      content: message_text
    }]);

    // 3. Forward the payload securely to n8n's Agent Webhook
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
          personal_details_snapshot
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

    // n8n sometimes wraps the response in an array — unwrap it
    let parsedResult = await n8nResponse.json();
    const result = Array.isArray(parsedResult) ? parsedResult[0] : parsedResult;
    const rawReply = result.assistant_reply || result.output || '';

    // The n8n Structured Output Parser double-encodes strings as JSON
    let assistantReply = rawReply;
    if (typeof rawReply === 'string') {
      const trimmed = rawReply.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
          assistantReply = JSON.parse(trimmed);
        } catch (_) {
          assistantReply = trimmed
            .slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
        }
      }
    }

    // 4. Save the assistant's reply to the same session
    if (assistantReply) {
      supabaseAdmin.from('health_chat_messages').insert([{
        session_id: session_id,
        role: 'assistant',
        content: assistantReply
      }]).then(({ error }) => {
        if (error) console.error('Failed to log assistant reply:', error.message);
      });
    }

    // 5. Return the CLEANED response to the frontend
    const cleanResponse = {
      assistant_reply: assistantReply,
      widgets: result.widgets || [],
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
