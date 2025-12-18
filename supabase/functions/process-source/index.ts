import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Get secrets
const N8N_WEBHOOK_URL = Deno.env.get('N8N_WEBHOOK_URL')
const N8N_WEBHOOK_SECRET = Deno.env.get('N8N_WEBHOOK_SECRET')

serve(async (req) => {
  // 1. Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // 2. Validate User (Supabase Auth)
    // The user ID is automatically available in the Authorization header sent by the client
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    // 3. Parse Body
    const { source_id, notebook_id, file_url, source_type, file_name } = await req.json()

    if (!source_id || !notebook_id || !file_url) {
      throw new Error('Missing required fields (source_id, notebook_id, file_url)')
    }

    if (!N8N_WEBHOOK_URL || !N8N_WEBHOOK_SECRET) {
      console.error('Missing N8N configuration secrets')
      throw new Error('Server configuration error')
    }

    // 4. Call n8n Webhook (Synchronous)
    console.log(`Triggering n8n for source: ${source_id}`)
    
    // We await the response here to return it to the client
    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-n8n-secret': N8N_WEBHOOK_SECRET
      },
      body: JSON.stringify({
        source_id,
        notebook_id,
        file_url,
        source_type,
        file_name,
        // user_token: authHeader 
      })
    })

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text()
      console.error('n8n error:', errorText)
      throw new Error(`n8n webhook failed: ${n8nResponse.statusText}`)
    }

    // 5. Parse n8n Response
    const n8nData = await n8nResponse.json()

    // 6. Persist Summary to Chat History (if exists)
    if (n8nData.summary) {
       // Initialize Supabase Client
       const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
       const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
       const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } }
       })

       // 1. Get/Create Session
       const { data: sessionData, error: sessionError } = await supabase
         .rpc('get_or_create_chat_session', { 
            p_notebook_id: notebook_id,
            p_user_id: (await supabase.auth.getUser()).data.user?.id 
         });

       if (sessionError) {
          console.error('Error getting chat session:', sessionError);
       } else {
          const sessionId = sessionData;
          
          // 2. Insert Message
          const { error: msgError } = await supabase
            .from('chat_messages')
            .insert({
                session_id: sessionId,
                role: 'assistant', 
                content: n8nData.summary,
                type: 'summary'
            });
            
          if (msgError) console.error('Error saving summary to chat:', msgError);
       }
    }

    return new Response(
      JSON.stringify(n8nData), 
      {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      },
    )

  } catch (error) {
    console.error('Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      },
    )
  }
})
