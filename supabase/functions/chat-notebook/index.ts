import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Get secrets (Assuming a separate webhook for chat, or same one with a 'type' field)
// For clarity, let's assume a separate variable or we pass 'type': 'chat' to the main one.
// Let's use a dedicated secret for the chat webhook URL if provided, otherwise fallback.
const N8N_CHAT_WEBHOOK_URL = Deno.env.get('N8N_WEBHOOK_CHAT_URL') || Deno.env.get('N8N_WEBHOOK_URL')
const N8N_WEBHOOK_SECRET = Deno.env.get('N8N_WEBHOOK_SECRET')

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const { message, notebook_id, session_id } = await req.json()

    if (!message || !notebook_id) {
      throw new Error('Missing required fields')
    }

    if (!N8N_CHAT_WEBHOOK_URL || !N8N_WEBHOOK_SECRET) {
      throw new Error('Server configuration error')
    }

    // 1. Get/Create Session
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: sessionId, error: sessionError } = await supabaseClient
         .rpc('get_or_create_chat_session', { 
            p_notebook_id: notebook_id,
            p_user_id: (await supabaseClient.auth.getUser()).data.user?.id
         });

    if (sessionError || !sessionId) {
        throw new Error('Failed to init chat session');
    }

    // 2. Persist User Message
    await supabaseClient.from('chat_messages').insert({
        session_id: sessionId,
        role: 'user',
        content: message,
        type: 'user_message'
    });

    // 3. Call n8n Chat Webhook
    const n8nResponse = await fetch(N8N_CHAT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-n8n-secret': N8N_WEBHOOK_SECRET
      },
      body: JSON.stringify({
        point: 'chat', 
        message,
        notebook_id,
        session_id: sessionId 
      })
    })

    if (!n8nResponse.ok) {
        // Optional: Persist error message?
      throw new Error(`n8n error: ${n8nResponse.statusText}`)
    }

    const data = await n8nResponse.json()
    
    let agentResponse;
    // Handle array response from n8n (common default)
    if (Array.isArray(data) && data.length > 0) {
        agentResponse = data[0].output?.Response || data[0].output?.summary || data[0].output || JSON.stringify(data[0]);
    } else {
        // Handle single object response
        agentResponse = data.output?.Response || data.summary || data.output || data.message || data.answer || JSON.stringify(data);
    }

    // Ensure we have a string
    if (typeof agentResponse === 'object') {
        agentResponse = JSON.stringify(agentResponse);
    }

    // 4. Persist Agent Response
    await supabaseClient.from('chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: agentResponse,
        type: 'agent_response'
    });

    return new Response(
      JSON.stringify({ ...data, content: agentResponse }), // Ensure content is returned clearly
      {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      },
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      },
    )
  }
})
