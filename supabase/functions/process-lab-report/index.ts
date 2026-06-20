import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAuth, isAuthError, verifyTwinOwner, verifySourceOwner } from '../_shared/healthTwinAuth.ts'

// Get secrets explicitly for the Health Twin Webhook
const N8N_HEALTH_WEBHOOK_URL = Deno.env.get('N8N_HEALTH_TWIN_LAB_WEBHOOK_URL') || Deno.env.get('N8N_Health_Twin_WEBHOOK_LAB_URL')
const N8N_HEALTH_WEBHOOK_SECRET = Deno.env.get('N8N_HEALTH_TWIN_LAB_WEBHOOK_SECRET') || Deno.env.get('N8N_WEBHOOK_SECRET')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function resolveLabFileUrl(
  adminClient: ReturnType<typeof createClient>,
  fileUrl: string,
  storagePath?: string | null,
): Promise<string> {
  if (storagePath) {
    const { data, error } = await adminClient.storage
      .from('health_documents')
      .createSignedUrl(storagePath, 3600)
    if (!error && data?.signedUrl) {
      return data.signedUrl
    }
  }
  return fileUrl
}

serve(async (req) => {
  // 1. Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Validate JWT and get caller identity
    const authResult = await requireAuth(req)
    if (isAuthError(authResult)) {
      return new Response(JSON.stringify({ error: authResult.message }), {
        status: authResult.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { user, adminClient } = authResult

    // 3. Parse Body
    const { file_url, storage_path, twin_id, file_id } = await req.json()

    if (!file_url || !twin_id || !file_id) {
      throw new Error('Missing required fields (file_url, twin_id, file_id)')
    }

    // 4. Verify twin and source ownership
    const ownsTwin = await verifyTwinOwner(adminClient, twin_id, user.id)
    if (!ownsTwin) {
      return new Response(JSON.stringify({ error: 'Forbidden: twin not found or not owned by caller' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ownsSource = await verifySourceOwner(adminClient, file_id, twin_id)
    if (!ownsSource) {
      return new Response(JSON.stringify({ error: 'Forbidden: source not found or does not belong to twin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!N8N_HEALTH_WEBHOOK_URL || !N8N_HEALTH_WEBHOOK_SECRET) {
      console.error('Missing N8N configuration secrets for Health Twin Webhook')
      throw new Error('Server configuration error')
    }

    const normalizedPath = (() => {
      try {
        return new URL(N8N_HEALTH_WEBHOOK_URL).pathname.toLowerCase()
      } catch {
        throw new Error('Invalid Health Twin lab webhook URL configuration')
      }
    })()
    if (normalizedPath.includes('trading-agents-run')) {
      throw new Error('Health Twin lab webhook is incorrectly pointed to Trading Agents workflow')
    }

    const resolvedFileUrl = await resolveLabFileUrl(adminClient, file_url, storage_path)

    // 4. Call n8n Webhook (Synchronous)
    console.log(`Triggering n8n lab report extraction for Twin: ${twin_id}, File: ${file_id}`)
    
    // Forward the payload and append the secure auth header
    const n8nResponse = await fetch(N8N_HEALTH_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-n8n-secret': N8N_HEALTH_WEBHOOK_SECRET
      },
      body: JSON.stringify({
        file_url: resolvedFileUrl,
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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (error: any) {
    console.error('Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
