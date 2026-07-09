import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const N8N_GUARDRAIL_WEBHOOK = Deno.env.get('N8N_GUARDRAIL_WEBHOOK') || 'https://n8n.saksham-experiments.com/webhook/ai-care-guardrail';
const N8N_QA_WEBHOOK = Deno.env.get('N8N_QA_WEBHOOK') || 'https://n8n.saksham-experiments.com/webhook/ai-care-qa-generation';
const N8N_DIAGNOSIS_WEBHOOK = Deno.env.get('N8N_DIAGNOSIS_WEBHOOK') || 'https://n8n.saksham-experiments.com/webhook/ai-care-diagnosis-workflow';

interface ChatRequestPayload {
  action: 'start_session' | 'send_message';
  session_id?: string;
  message?: string;
  user_id?: string;
  stream?: boolean;
  product?: 'ai-care' | 'libertymd';
  anonymous?: boolean;
  region?: 'EU' | 'US';
  demographics?: {
    age?: string | number;
    sex?: string;
  };
}

interface MessageItem {
  role: string;
  content: string;
}

interface DatabaseMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  options?: string[];
  created_at: string;
}

interface GuardrailResult {
  is_emergency: boolean;
  force_end?: boolean;
  status?: string;
  message?: string;
  source?: string;
}

const sseHeaders = {
  ...corsHeaders,
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Instant local screen for classic emergencies before any network hop. */
function deterministicEmergency(message: string): GuardrailResult | null {
  const msg = message.toLowerCase();
  // Negation-aware: ignore "no chest pain", "without shortness of breath", etc.
  const negated = (pattern: RegExp) => {
    const m = msg.match(pattern);
    if (!m || m.index === undefined) return false;
    const window = msg.slice(Math.max(0, m.index - 24), m.index);
    return /\b(no|not|without|denies|denied)\b/.test(window);
  };

  const rules: Array<{ re: RegExp; message: string }> = [
    {
      re: /chest (pain|pressure|tightness)|crushing (chest|pressure)|elephant (on|sitting)/i,
      message: 'These symptoms can be a medical emergency. Call 911 or go to the ER now. Do not drive yourself.',
    },
    {
      re: /worst headache of (my|his|her) life|thunderclap|sudden (severe )?headache/i,
      message: 'A sudden worst-of-life headache can be an emergency. Call 911 or go to the ER now.',
    },
    {
      re: /(throat (is )?tight|lip swelling|tongue swelling|anaphylaxis|cannot breathe after|wheezing after (peanut|shellfish|bee))/i,
      message: 'This may be anaphylaxis. Use epinephrine if available and call 911 immediately.',
    },
    {
      re: /(cannot breathe|can't breathe|blue lips|oxygen (sat|saturation) (is )?(8\d|9[0-2])\b)/i,
      message: 'Severe breathing problems need emergency care. Call 911 or go to the ER now.',
    },
  ];

  for (const rule of rules) {
    if (rule.re.test(msg) && !negated(rule.re)) {
      return {
        is_emergency: true,
        force_end: true,
        status: 'force_end',
        message: rule.message,
        source: 'deterministic',
      };
    }
  }
  return null;
}

function normalizeGuardrail(raw: any): GuardrailResult {
  const is_emergency = !!(raw?.is_emergency || raw?.force_end || raw?.status === 'force_end' || raw?.crisis_detected);
  return {
    is_emergency,
    force_end: !!(raw?.force_end ?? is_emergency),
    status: raw?.status || (is_emergency ? 'force_end' : 'pass'),
    message: raw?.message || (is_emergency ? 'Please call emergency services immediately.' : 'No emergency detected.'),
    source: raw?.source || 'n8n',
  };
}

/** Bound outbound n8n calls so the Edge Function always returns before the gateway 503s. */
function withTimeout(ms: number, parent?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  if (parent) {
    if (parent.aborted) ctrl.abort();
    else parent.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    clear: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onAbort);
    },
  };
}

async function fetchGuardrail(message: string, history: MessageItem[], signal?: AbortSignal): Promise<GuardrailResult> {
  const local = deterministicEmergency(message);
  if (local) return local;

  const { signal: timed, clear } = withTimeout(8000, signal);
  try {
    const res = await fetch(N8N_GUARDRAIL_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
      signal: timed,
    });
    const raw = await res.json().catch(() => ({ is_emergency: false }));
    return normalizeGuardrail(raw);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      return { is_emergency: false, status: 'pass', message: 'aborted', source: 'aborted' };
    }
    // Fail open to interview (deterministic already caught classics); log-worthy
    console.error('guardrail fetch failed', e);
    return { is_emergency: false, status: 'pass', message: 'Guardrail unavailable', source: 'error_fail_open' };
  } finally {
    clear();
  }
}

function normalizeQAPayload(raw: any) {
  const qaData = raw?.output && typeof raw.output === 'object' ? raw.output : raw;
  const next_question = String(
    qaData?.next_question || qaData?.question || '',
  ).trim();
  const options = Array.isArray(qaData?.options)
    ? qaData.options.map(String).filter(Boolean).slice(0, 4)
    : [];
  return {
    next_question,
    options,
    ready_for_report: !!qaData?.ready_for_report,
    qa_source: 'n8n' as const,
  };
}

async function fetchQAOnce(history: MessageItem[], timeoutMs: number, signal?: AbortSignal) {
  const { signal: timed, clear } = withTimeout(timeoutMs, signal);
  try {
    const res = await fetch(N8N_QA_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history }),
      signal: timed,
    });
    if (!res.ok) {
      throw new Error(`QA webhook HTTP ${res.status}`);
    }
    const raw = await res.json().catch(() => ({}));
    const normalized = normalizeQAPayload(raw);
    if (!normalized.next_question) {
      throw new Error('QA webhook returned empty question');
    }
    return normalized;
  } finally {
    clear();
  }
}

async function fetchQA(history: MessageItem[], signal?: AbortSignal) {
  // Wait up to 20s for the real n8n agent question before using backup.
  try {
    if (!signal?.aborted) {
      return await fetchQAOnce(history, 20_000, signal);
    }
  } catch (e) {
    console.error('qa fetch failed after 20s', e);
    if ((e as Error)?.name === 'AbortError' && signal?.aborted) {
      // Parent aborted (emergency) — do not invent a follow-up question.
      return {
        next_question: '',
        options: [],
        ready_for_report: false,
        qa_source: 'aborted' as const,
      };
    }
  }

  return {
    next_question:
      'Sorry — that took too long. Could you briefly restate your main symptom and how long it has lasted?',
    options: [
      'Fever for a few days',
      'Cough or sore throat',
      'Pain somewhere specific',
      'Something else — I will type it',
    ],
    ready_for_report: false,
    qa_source: 'fallback' as const,
  };
}

function parseDiagnosisPayload(diagData: any) {
  let data = diagData;
  if (typeof data?.output === 'string') {
    try {
      data = JSON.parse(data.output);
    } catch {
      const match = data.output.match(/```json\n([\s\S]*?)\n```/);
      if (match) {
        try {
          data = JSON.parse(match[1]);
        } catch {
          /* ignore */
        }
      }
    }
  } else if (data?.output && typeof data.output === 'object') {
    data = data.output;
  }

  let confScore = 0;
  let diagnosesList: any[] = [];
  if (Array.isArray(data?.differential_diagnosis) && data.differential_diagnosis.length) {
    diagnosesList = data.differential_diagnosis;
    if (typeof data.confidence_score === 'number') {
      confScore = data.confidence_score;
    } else {
      const confString = String(data.differential_diagnosis[0].confidence || '0');
      confScore = parseInt(confString.replace('%', ''), 10) || 0;
    }
  } else if (data?.confidence_score !== undefined) {
    confScore = Number(data.confidence_score) || 0;
    diagnosesList = data.diagnoses || data.differential_diagnosis || [];
  } else if (data?.diagnosis) {
    confScore = data.diagnosis.confidence || 0;
    diagnosesList = [data.diagnosis];
  }

  const reportReady = data?.ui_state === 'report_ready' || data?.diagnosis_ready === true || diagnosesList.length > 0;
  return { confScore, diagnosesList, raw: data, reportReady };
}

function chunkText(text: string, size = 18): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks.length ? chunks : [text];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: ChatRequestPayload = await req.json();
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isLibertyMd = payload.product === 'libertymd';
    const allowAnonymousLibertyMd = isLibertyMd && payload.anonymous === true;

    const userScopedClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined,
    );

    const {
      data: { user },
    } = authHeader
      ? await userScopedClient.auth.getUser()
      : { data: { user: null } };

    if (!user && !allowAnonymousLibertyMd) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (!user && allowAnonymousLibertyMd && !serviceRoleKey) {
      return jsonResponse({ error: 'LibertyMd anonymous mode is not configured' }, 503);
    }

    const supabaseClient = user
      ? userScopedClient
      : createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
    const actorUserId = user?.id ?? null;

    // Opt-in streaming so supabase.functions.invoke (JSON) clients keep working
    const wantStream = payload.stream === true;

    if (payload.action === 'start_session') {
      const { data: session, error: sessionError } = await supabaseClient
        .from('jivi_chat_sessions')
        .insert({ user_id: actorUserId })
        .select()
        .single();

      if (sessionError) throw sessionError;

      const { data: profile } = actorUserId
        ? await supabaseClient
            .from('jivi_profiles')
            .select('name')
            .eq('user_id', actorUserId)
            .limit(1)
            .maybeSingle()
        : { data: null };

      const rawName = profile?.name || user?.email?.split('@')[0] || '';
      const userName = rawName.split(' ')[0] || rawName;
      const initialQuestion = isLibertyMd
        ? `Hi${userName ? ` ${userName}` : ''}, I'm LibertyMd. Tell me what's going on today, including when it started and what worries you most.`
        : `Hello ${userName}, what symptoms or concerns would you like to discuss today?`;
      const initialOptions = isLibertyMd
        ? [
            'I have fever, cough, and body aches.',
            'I have chest pain and shortness of breath.',
            'My wrist hurts after a fall.',
            'I have burning when I pee.',
          ]
        : [
            'I am constantly thirsty and have to use the bathroom all night.',
            'I have a sharp pain in the lower right side of my stomach.',
            'I get breathless and my chest feels tight.',
            'I have a bad headache that won\'t go away.',
          ];

      await supabaseClient.from('jivi_chat_messages').insert({
        session_id: session.id,
        role: 'assistant',
        content: initialQuestion,
        options: initialOptions,
      });

      return jsonResponse({
        session_id: session.id,
        initial_question: initialQuestion,
        options: initialOptions,
        product: isLibertyMd ? 'libertymd' : 'ai-care',
        anonymous: !actorUserId,
      });
    }

    if (payload.action !== 'send_message') {
      return jsonResponse({ error: 'Invalid action' }, 400);
    }

    const sessionId = payload.session_id;
    const userMessage = payload.message;
    if (!sessionId || !userMessage) {
      return jsonResponse({ error: 'Missing session_id or message' }, 400);
    }

    const { data: existingSession, error: existingSessionError } = await supabaseClient
      .from('jivi_chat_sessions')
      .select('id,user_id,status')
      .eq('id', sessionId)
      .maybeSingle();

    if (existingSessionError) throw existingSessionError;
    if (!existingSession) {
      return jsonResponse({ error: 'Session not found' }, 404);
    }
    if (actorUserId && existingSession.user_id && existingSession.user_id !== actorUserId) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    if (!actorUserId && existingSession.user_id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    if (existingSession.status === 'emergency_stopped') {
      return jsonResponse({
        emergency: true,
        message: 'This evaluation was stopped for safety. Please seek emergency care if symptoms persist, or start a new evaluation.',
        guardrail_source: 'session_status',
      });
    }
    if (existingSession.status === 'completed') {
      return jsonResponse({
        diagnosis_ready: true,
        message: 'This evaluation is already complete.',
      });
    }
    if (existingSession.status === 'abandoned') {
      return jsonResponse({ error: 'This evaluation was closed. Please start a new chat.' }, 409);
    }

    await supabaseClient.from('jivi_chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: userMessage,
    });

    const { data: messages } = await supabaseClient
      .from('jivi_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    const messageHistory: MessageItem[] =
      messages?.map((m: DatabaseMessage) => ({ role: m.role, content: m.content })) || [];
    const userMessageCount = messageHistory.filter((m) => m.role === 'user').length;

    // Instant local emergency short-circuit (no network)
    const localEmergency = deterministicEmergency(userMessage);
    if (localEmergency) {
      await supabaseClient.from('jivi_alerts').insert({
        session_id: sessionId,
        is_emergency: true,
        message: localEmergency.message,
      });
      await supabaseClient.from('jivi_chat_sessions').update({ status: 'emergency_stopped' }).eq('id', sessionId);

      if (!wantStream) {
        return jsonResponse({
          emergency: true,
          message: localEmergency.message,
          guardrail_source: localEmergency.source,
        });
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };
          send('status', { state: 'emergency_end', source: localEmergency.source });
          send('final', {
            state: 'emergency_end',
            emergency: true,
            message: localEmergency.message,
            guardrail_source: localEmergency.source,
          });
          controller.close();
        },
      });
      return new Response(stream, { headers: sseHeaders });
    }

    const runPipeline = async (emit?: (event: string, data: unknown) => void) => {
      const qaAbort = new AbortController();
      const timing: Record<string, number> = { t0: Date.now() };

      emit?.('status', { state: 'checking_safety_and_generating' });

      // Parallel: n8n guardrail + (QA or we'll decide diagnosis after)
      // For early turns: parallel guardrail || QA
      // For later turns: parallel guardrail || diagnosis path decision still needs history; run guardrail || QA first unless count high

      // Parallel: guardrail + QA. Abort QA if emergency wins.
      const guardPromise = fetchGuardrail(userMessage, messageHistory);
      const qaPromise = fetchQA(messageHistory, qaAbort.signal);

      const guardrailData = await guardPromise;
      timing.guardrail_ms = Date.now() - timing.t0;
      emit?.('status', {
        state: guardrailData.is_emergency ? 'emergency_end' : 'safety_passed',
        guardrail_ms: timing.guardrail_ms,
        source: guardrailData.source,
      });

      if (guardrailData.is_emergency) {
        qaAbort.abort();
        await supabaseClient.from('jivi_alerts').insert({
          session_id: sessionId,
          is_emergency: true,
          message: guardrailData.message || 'Emergency detected',
        });
        await supabaseClient.from('jivi_chat_sessions').update({ status: 'emergency_stopped' }).eq('id', sessionId);
        return {
          type: 'emergency' as const,
          message: guardrailData.message || 'Please call emergency services immediately.',
          guardrail_source: guardrailData.source,
          timing,
        };
      }

      emit?.('status', { state: 'generating_question' });
      const qaData = await qaPromise;
      timing.qa_ms = Date.now() - timing.t0;

      if (!qaData.next_question) {
        // Emergency abort or empty agent payload — use backup so the UI never stalls blank.
        const backup = {
          next_question:
            'Sorry — that took too long. Could you briefly restate your main symptom and how long it has lasted?',
          options: [
            'Fever for a few days',
            'Cough or sore throat',
            'Pain somewhere specific',
            'Something else — I will type it',
          ],
          ready_for_report: false,
          qa_source: 'fallback' as const,
        };
        Object.assign(qaData, backup);
      }

      const shouldRunDiagnosis =
        !!qaData.ready_for_report || userMessageCount >= 8 || /home care|summary|i'?m done|give me (the )?report/i.test(userMessage);

      if (shouldRunDiagnosis) {
        emit?.('status', { state: 'running_diagnosis' });
        const { data: systemMsg } = await supabaseClient
          .from('jivi_chat_messages')
          .select('content')
          .eq('session_id', sessionId)
          .eq('role', 'system')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        let intermediate: any[] = [];
        try {
          if (systemMsg?.content) {
            intermediate = JSON.parse(systemMsg.content).intermediate_diagnoses || [];
          }
        } catch {
          /* ignore */
        }

        const { signal: diagSignal, clear: clearDiag } = withTimeout(8000);
        let diagRaw: any = { confidence_score: 0 };
        try {
          const diagRes = await fetch(N8N_DIAGNOSIS_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              history: messageHistory,
              intermediate_diagnoses: intermediate,
            }),
            signal: diagSignal,
          });
          diagRaw = await diagRes.json().catch(() => ({ confidence_score: 0 }));
        } catch (e) {
          console.error('diagnosis fetch failed', e);
        } finally {
          clearDiag();
        }
        const { confScore, diagnosesList, raw, reportReady } = parseDiagnosisPayload(diagRaw);
        timing.diagnosis_ms = Date.now() - timing.t0;

        if (reportReady && (confScore >= 50 || qaData.ready_for_report || userMessageCount >= 8)) {
          await supabaseClient.from('jivi_diagnoses').insert({
            session_id: sessionId,
            diagnosis_data: diagnosesList.length ? diagnosesList : raw,
            confidence_score: confScore,
          });
          await supabaseClient.from('jivi_chat_sessions').update({ status: 'completed' }).eq('id', sessionId);
          return {
            type: 'diagnosis_ready' as const,
            confidence_score: confScore,
            report: raw,
            timing,
          };
        }

        if (diagnosesList.length > 0) {
          await supabaseClient.from('jivi_chat_messages').insert({
            session_id: sessionId,
            role: 'system',
            content: JSON.stringify({ intermediate_diagnoses: diagnosesList }),
          });
        }
      }

      await supabaseClient.from('jivi_chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: qaData.next_question,
        options: qaData.options,
      });

      return {
        type: 'question' as const,
        next_question: qaData.next_question,
        options: qaData.options,
        ready_for_report: qaData.ready_for_report,
        qa_source: (qaData as any).qa_source || 'n8n',
        timing,
        parallel: true,
      };
    };

    if (!wantStream) {
      const result = await runPipeline();
      if (result.type === 'emergency') {
        return jsonResponse({
          emergency: true,
          message: result.message,
          guardrail_source: result.guardrail_source,
          timing: result.timing,
        });
      }
      if (result.type === 'diagnosis_ready') {
        return jsonResponse({
          diagnosis_ready: true,
          confidence_score: result.confidence_score,
          report: (result as any).report || null,
          timing: result.timing,
        });
      }
      return jsonResponse({
        next_question: result.next_question,
        options: result.options,
        ready_for_report: result.ready_for_report,
        qa_source: (result as any).qa_source || 'n8n',
        timing: result.timing,
        parallel: result.parallel,
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        try {
          send('status', { state: 'started' });
          const result = await runPipeline((event, data) => send(event, data));

          if (result.type === 'emergency') {
            send('final', {
              state: 'emergency_end',
              emergency: true,
              message: result.message,
              guardrail_source: result.guardrail_source,
              timing: result.timing,
            });
            controller.close();
            return;
          }

          if (result.type === 'diagnosis_ready') {
            send('final', {
              state: 'diagnosis_ready',
              diagnosis_ready: true,
              confidence_score: result.confidence_score,
              timing: result.timing,
            });
            controller.close();
            return;
          }

          // Perceived streaming: chunk the completed question while FE paints
          for (const piece of chunkText(result.next_question)) {
            send('token', { text: piece });
            await new Promise((r) => setTimeout(r, 12));
          }

          send('final', {
            state: 'asking_question',
            next_question: result.next_question,
            options: result.options,
            ready_for_report: result.ready_for_report,
            qa_source: (result as any).qa_source || 'n8n',
            timing: result.timing,
            parallel: result.parallel,
          });
          controller.close();
        } catch (e) {
          send('final', {
            state: 'error',
            error: e instanceof Error ? e.message : String(e),
          });
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: sseHeaders });
  } catch (error) {
    console.error(error);
    const errMessage = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: errMessage }, 500);
  }
});
