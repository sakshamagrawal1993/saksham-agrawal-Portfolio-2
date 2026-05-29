import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Get secrets
const INSIGHTSLM_SOURCE_WEBHOOK_URL =
  Deno.env.get('INSIGHTSLM_SOURCE_WEBHOOK_URL') ||
  Deno.env.get('N8N_WEBHOOK_URL')
const INSIGHTSLM_SOURCE_WEBHOOK_SECRET =
  Deno.env.get('INSIGHTSLM_SOURCE_WEBHOOK_SECRET') ||
  Deno.env.get('N8N_WEBHOOK_SECRET')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''

type SourceProcessResult = {
  notebook_id: string
  source_id: string
  status: string
  summary?: string
  result_source?: 'n8n' | 'fallback'
}

async function resolveSourceFileUrl(
  fileUrl: string | undefined,
  storagePath: string | undefined,
): Promise<string> {
  if (storagePath) {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data, error } = await supabaseAdmin.storage
      .from('InsightsLM')
      .createSignedUrl(storagePath, 3600)
    if (!error && data?.signedUrl) {
      return data.signedUrl
    }
  }

  if (fileUrl) {
    return fileUrl
  }

  throw new Error('Missing required fields (file_url or storage_path)')
}

async function generateFallbackSummary(
  fileUrl: string,
  fileName: string,
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI fallback unavailable: missing OPENAI_API_KEY')
  }

  const fileResponse = await fetch(fileUrl)
  if (!fileResponse.ok) {
    throw new Error(`Could not fetch source file (${fileResponse.status})`)
  }

  const contentType = fileResponse.headers.get('content-type') ?? ''
  const rawText = await fileResponse.text()
  const trimmed = rawText.trim()
  if (!trimmed) {
    throw new Error('Source file was empty')
  }

  const isPlainText = contentType.includes('text/plain') || fileName.endsWith('.txt')
  const userContent = isPlainText
    ? trimmed.slice(0, 12000)
    : trimmed.slice(0, 12000)

  const summaryResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You summarize uploaded notebook sources in 50-75 words. Be factual, concise, and mention the document title if provided.',
        },
        {
          role: 'user',
          content: `Title: ${fileName}\n\nContent:\n${userContent}`,
        },
      ],
      temperature: 0.4,
    }),
  })

  if (!summaryResponse.ok) {
    throw new Error(`OpenAI fallback failed: ${await summaryResponse.text()}`)
  }

  const summaryJson = await summaryResponse.json()
  const summary = summaryJson?.choices?.[0]?.message?.content?.trim()
  if (!summary) {
    throw new Error('OpenAI fallback returned no summary')
  }
  return summary
}

async function persistSummaryToChat(
  authHeader: string,
  notebookId: string,
  summary: string,
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const jwt = authHeader.replace('Bearer ', '').trim()
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !userData.user) {
    throw new Error('Unauthorized')
  }

  const { data: notebook, error: notebookErr } = await supabase
    .from('notebooks')
    .select('id')
    .eq('id', notebookId)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (notebookErr || !notebook) {
    throw new Error('Notebook not found or unauthorized')
  }

  let sessionId: string | null = null
  const { data: existingSession, error: existingSessionErr } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('notebook_id', notebookId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingSessionErr) {
    console.error('Error getting chat session:', existingSessionErr)
  } else if (existingSession?.id) {
    sessionId = existingSession.id
    await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId)
  } else {
    const { data: createdSession, error: createSessionErr } = await supabase
      .from('chat_sessions')
      .insert({ notebook_id: notebookId, title: 'New chat' })
      .select('id')
      .single()
    if (createSessionErr || !createdSession?.id) {
      console.error('Error creating chat session:', createSessionErr)
    } else {
      sessionId = createdSession.id
    }
  }

  if (sessionId) {
    const { error: msgError } = await supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: summary,
      type: 'summary',
    })
    if (msgError) console.error('Error saving summary to chat:', msgError)
  }
}

async function callN8nSourceWebhook(payload: Record<string, unknown>) {
  const n8nResponse = await fetch(INSIGHTSLM_SOURCE_WEBHOOK_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-n8n-secret': INSIGHTSLM_SOURCE_WEBHOOK_SECRET!,
    },
    body: JSON.stringify(payload),
  })

  const raw = await n8nResponse.text()
  if (!n8nResponse.ok) {
    throw new Error(`n8n webhook failed (${n8nResponse.status}): ${raw.slice(0, 500)}`)
  }

  if (!raw.trim()) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    console.error('n8n returned non-JSON body:', raw.slice(0, 200))
    return null
  }
}

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
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    const { source_id, notebook_id, file_url, storage_path, source_type, file_name } = await req.json()

    if (!source_id || !notebook_id) {
      throw new Error('Missing required fields (source_id, notebook_id)')
    }

    if (!INSIGHTSLM_SOURCE_WEBHOOK_URL || !INSIGHTSLM_SOURCE_WEBHOOK_SECRET) {
      console.error('Missing N8N configuration secrets')
      throw new Error('Server configuration error')
    }

    const normalizedPath = (() => {
      try {
        return new URL(INSIGHTSLM_SOURCE_WEBHOOK_URL).pathname.toLowerCase()
      } catch {
        throw new Error('Invalid InsightsLM source webhook URL configuration')
      }
    })()
    if (normalizedPath.includes('trading-agents-run')) {
      throw new Error('InsightsLM source webhook is incorrectly pointed to Trading Agents workflow')
    }

    const resolvedFileUrl = await resolveSourceFileUrl(file_url, storage_path)
    const webhookPayload = {
      source_id,
      notebook_id,
      file_url: resolvedFileUrl,
      source_type,
      file_name,
    }

    console.log(`Triggering n8n for source: ${source_id}`)

    let result: SourceProcessResult | null = null
    try {
      const n8nData = await callN8nSourceWebhook(webhookPayload)
      if (n8nData?.summary) {
        result = {
          notebook_id,
          source_id,
          status: n8nData.status ?? 'processed',
          summary: n8nData.summary,
          result_source: 'n8n',
        }
      }
    } catch (n8nError) {
      const message = n8nError instanceof Error ? n8nError.message : String(n8nError)
      const allowFallback = source_type === 'text' || String(file_name ?? '').endsWith('.txt')
      if (!allowFallback) {
        throw n8nError
      }
      console.warn('n8n source processing failed; using fallback for text source:', message)
    }

    if (!result && (source_type === 'text' || String(file_name ?? '').endsWith('.txt'))) {
      const summary = await generateFallbackSummary(resolvedFileUrl, file_name ?? 'Pasted Text')
      result = {
        notebook_id,
        source_id,
        status: 'processed',
        summary,
        result_source: 'fallback',
      }
    }

    if (!result?.summary) {
      throw new Error('Source processing did not return a summary')
    }

    await persistSummaryToChat(authHeader, notebook_id, result.summary)

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      },
    )
  }
})
