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

    // Forward the payload securely to n8n's Agent Webhook
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-n8n-secret': n8nSecret,
      },
      body: JSON.stringify({
        twin_id,
        session_id,
        message_text,
        personal_details_snapshot
      }),
    });

    if (!n8nResponse.ok) {
      console.error(`n8n responded with status: ${n8nResponse.status}`);
      const errorText = await n8nResponse.text();
      return new Response(
        JSON.stringify({ error: 'Failed to process chat through agent pipeline', details: errorText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    const result = await n8nResponse.json();
    const rawReply = result.assistant_reply || result.output || '';

    // The n8n Structured Output Parser double-encodes strings as JSON
    // (surrounding quotes + escaped \n etc.). JSON.parse decodes it cleanly in one shot.
    let assistantReply = rawReply;
    if (typeof rawReply === 'string') {
      // If it looks like a JSON-encoded string, parse it
      const trimmed = rawReply.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
          assistantReply = JSON.parse(trimmed);
        } catch (_) {
          // Fallback: strip quotes and unescape manually
          assistantReply = trimmed
            .slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
        }
      }
    }

    // Asynchronously log the assistant's reply to Postgres (fire and forget)
    // We do this here instead of n8n to reduce latency on the webhook response
    if (assistantReply) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      supabaseAdmin.from('health_chat_messages').insert([{
        session_id: session_id,
        role: 'assistant',
        content: assistantReply
      }]).then(({ error }) => {
        if (error) console.error('Failed to log assistant reply:', error.message);
      });
    }

    return new Response(
      JSON.stringify(result),
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
