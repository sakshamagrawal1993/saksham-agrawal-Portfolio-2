import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Get secrets explicitly for the Health Twin Webhook
const N8N_HEALTH_WEBHOOK_URL = Deno.env.get('N8N_Health_Twin_WEBHOOK_LAB_URL')
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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    // 3. Parse Body
    const { file_url, twin_id, file_id } = await req.json()

    if (!file_url || !twin_id || !file_id) {
      throw new Error('Missing required fields (file_url, twin_id, file_id)')
    }

    if (!N8N_HEALTH_WEBHOOK_URL || !N8N_WEBHOOK_SECRET) {
      console.error('Missing N8N configuration secrets for Health Twin Webhook')
      throw new Error('Server configuration error')
    }

    // 4. Call n8n Webhook (Synchronous)
    console.log(`Triggering n8n lab report extraction for Twin: ${twin_id}, File: ${file_id}`)
    
    // Forward the payload and append the secure auth header
    const n8nResponse = await fetch(N8N_HEALTH_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-n8n-secret': N8N_WEBHOOK_SECRET
      },
      body: JSON.stringify({
        file_url,
        twin_id,
        file_id
      })
    })

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text()
      console.error('n8n error:', errorText)
      throw new Error(`n8n webhook failed: ${n8nResponse.statusText}`)
    }

    // 5. Parse and Return n8n Response back to Frontend
    const n8nData = await n8nResponse.json()

    return new Response(
      JSON.stringify(n8nData), 
      {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      },
    )

  } catch (error: any) {
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
