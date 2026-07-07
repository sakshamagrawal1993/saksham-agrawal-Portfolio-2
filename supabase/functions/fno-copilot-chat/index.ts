import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fno-copilot-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const getSupabase = (req: Request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
};

const getCallerUserId = async (supabase: ReturnType<typeof createClient>, req: Request) => {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.startsWith("sb_publishable_")) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
};

type WorkflowType =
  | "ask_ai"
  | "create_trade"
  | "create_algo_strategy"
  | "option_screener";

type ArtifactInstruction = {
  operation?: "merge" | "replace" | "json_patch";
  status?: string;
  missing_inputs?: string[];
  updated_artifact_payload?: Record<string, unknown>;
  validation_flags?: Array<Record<string, unknown>>;
};

const isWorkflowType = (value: unknown): value is WorkflowType =>
  value === "ask_ai" ||
  value === "create_trade" ||
  value === "create_algo_strategy" ||
  value === "option_screener";

const normalizeN8nBody = (payload: unknown) => {
  if (Array.isArray(payload)) return payload[0] ?? {};
  if (payload && typeof payload === "object") return payload as Record<string, unknown>;
  return {};
};

const normalizeArtifactInstruction = (value: unknown): ArtifactInstruction => {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const operation =
    raw.operation === "replace" || raw.operation === "json_patch" ? raw.operation : "merge";
  const status = typeof raw.status === "string" ? raw.status : undefined;
  const updatedArtifactPayload =
    raw.updated_artifact_payload && typeof raw.updated_artifact_payload === "object"
      ? (raw.updated_artifact_payload as Record<string, unknown>)
      : undefined;
  const missingInputs = Array.isArray(raw.missing_inputs)
    ? raw.missing_inputs.map((item) => String(item))
    : undefined;
  const validationFlags = Array.isArray(raw.validation_flags)
    ? raw.validation_flags.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>
    : undefined;

  return {
    operation,
    status,
    missing_inputs: missingInputs,
    updated_artifact_payload: updatedArtifactPayload,
    validation_flags: validationFlags,
  };
};

const deepMerge = (base: unknown, updates: unknown): Record<string, unknown> => {
  const baseObj = base && typeof base === "object" ? (base as Record<string, unknown>) : {};
  const updatesObj = updates && typeof updates === "object" ? (updates as Record<string, unknown>) : {};
  const merged: Record<string, unknown> = { ...baseObj };

  for (const [key, value] of Object.entries(updatesObj)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      baseObj[key] &&
      typeof baseObj[key] === "object" &&
      !Array.isArray(baseObj[key])
    ) {
      merged[key] = deepMerge(baseObj[key], value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
};

const objectOrUndefined = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const requireServiceSecret = (req: Request) => {
  const apikey = req.headers.get("apikey") || "";
  const auth = req.headers.get("authorization") || "";
  if (apikey.startsWith("sb_publishable_") || auth.startsWith("Bearer sb_publishable_")) {
    return true;
  }
  const expected = Deno.env.get("FNO_COPILOT_SERVICE_SECRET");
  if (!expected) return true;
  return req.headers.get("x-fno-copilot-secret") === expected;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  
  if (!requireServiceSecret(req)) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabase = getSupabase(req);
  if (!supabase) return jsonResponse({ ok: false, error: "Internal Server Error: No DB" }, 500);

  try {
    const { session_id, message, workflow_type, user_id, current_artifact } = await req.json();
    if (!session_id || !message) return jsonResponse({ ok: false, error: "Missing required fields" }, 400);
    if (workflow_type && !isWorkflowType(workflow_type)) {
      return jsonResponse({ ok: false, error: "Invalid workflow_type" }, 400);
    }

    const callerUserId = await getCallerUserId(supabase, req);
    const requestedUserId = typeof user_id === "string" ? user_id : null;
    if (callerUserId && requestedUserId && callerUserId !== requestedUserId) {
      return jsonResponse({ ok: false, error: "User mismatch" }, 403);
    }

    // 1. Fetch current session & artifact
    const { data: sessionData, error: sessionErr } = await supabase
      .from('fno_ai_sessions')
      .select('workflow_type, user_id, messages')
      .eq('id', session_id)
      .single();
      
    if (sessionErr || !sessionData) return jsonResponse({ ok: false, error: "Session not found" }, 404);
    if (sessionData.user_id && !callerUserId) {
      return jsonResponse({ ok: false, error: "Authentication required for this session" }, 401);
    }
    if (sessionData.user_id && callerUserId && sessionData.user_id !== callerUserId) {
      return jsonResponse({ ok: false, error: "Forbidden" }, 403);
    }
    if (sessionData.user_id && requestedUserId && sessionData.user_id !== requestedUserId) {
      return jsonResponse({ ok: false, error: "User mismatch" }, 403);
    }
    if (workflow_type && sessionData.workflow_type !== workflow_type) {
      return jsonResponse({
        ok: false,
        error: `Session mode mismatch. Session is ${sessionData.workflow_type}, got ${workflow_type}`,
      }, 409);
    }

    const { data: artifactData, error: artifactErr } = await supabase
      .from('fno_ai_artifacts')
      .select('id, payload, status, validation_flags')
      .eq('ai_session_id', session_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (artifactErr || !artifactData) return jsonResponse({ ok: false, error: "Artifact not found" }, 404);

    const artifactBasePayload = objectOrUndefined(current_artifact)
      ? deepMerge(artifactData.payload, current_artifact)
      : artifactData.payload as Record<string, unknown>;

    // 2. Append new message to history
    const updatedMessages = [...(sessionData.messages || []), { role: 'user', content: message, created_at: new Date().toISOString() }];
    await supabase.from('fno_ai_sessions').update({ messages: updatedMessages, updated_at: new Date().toISOString() }).eq('id', session_id);

    // 3. Call n8n Orchestrator Webhook
    const webhookUrl = Deno.env.get("FNO_COPILOT_ALGO_STRATEGY_WEBHOOK_URL") || "https://n8n.saksham-experiments.com/webhook/fno-copilot-orchestrator";
    const webhookSecret = Deno.env.get("N8N_WEBHOOK_SECRET") || "";

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (webhookSecret) headers["x-n8n-secret"] = webhookSecret;

    let assistantReply = "I updated your artifact draft. Tell me what to change next.";
    let artifactInstruction: ArtifactInstruction = {};
    let degraded = false;

    try {
      const n8nRes = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          session_id,
          user_id: sessionData.user_id,
          mode: sessionData.workflow_type,
          workflow_type: sessionData.workflow_type,
          chat_history: updatedMessages,
          current_artifact: artifactBasePayload,
          body: {
            session_id,
            user_id: sessionData.user_id,
            mode: sessionData.workflow_type,
            workflow_type: sessionData.workflow_type,
            chat_history: updatedMessages,
            current_artifact: artifactBasePayload,
          },
        })
      });

      if (!n8nRes.ok) {
        throw new Error(`n8n webhook failed with status ${n8nRes.status}`);
      }

      const rawN8nData = normalizeN8nBody(await n8nRes.json());
      const n8nData = normalizeN8nBody(rawN8nData.response ?? rawN8nData);
      assistantReply = typeof n8nData.assistant_reply === "string"
        ? n8nData.assistant_reply
        : assistantReply;
      artifactInstruction = normalizeArtifactInstruction(n8nData.artifact_instruction);
    } catch (n8nError) {
      // Graceful degradation: never orphan the user's message on a workflow failure.
      // Save a friendly reply, leave the artifact unchanged, and return 200.
      console.error("fno-copilot-chat n8n failure:", n8nError);
      degraded = true;
      assistantReply =
        "Sorry — I hit a snag while working on that and couldn't apply the change, so your strategy is unchanged. Please try again or rephrase what you'd like to adjust.";
      artifactInstruction = {};
    }

    // 4. Update DB with LLM Response
    const finalMessages = [...updatedMessages, { role: 'assistant', content: assistantReply, created_at: new Date().toISOString() }];

    const newArtifactPayload = artifactInstruction.operation === "replace"
      ? (artifactInstruction.updated_artifact_payload ?? artifactBasePayload)
      : deepMerge(artifactBasePayload, artifactInstruction.updated_artifact_payload);
    const newStatus = artifactInstruction.status || artifactData.status || 'draft';
    const missingInputs = artifactInstruction.missing_inputs ?? [];
    const sessionState = newStatus === "ready" ? "completed" : "waiting_input";
    const validationFlags = artifactInstruction.validation_flags ?? artifactData.validation_flags ?? [];

    await supabase
      .from('fno_ai_sessions')
      .update({ messages: finalMessages, missing_inputs: missingInputs, state: sessionState, updated_at: new Date().toISOString() })
      .eq('id', session_id);

    await supabase
      .from('fno_ai_artifacts')
      .update({
        payload: newArtifactPayload,
        status: newStatus,
        validation_flags: validationFlags,
      })
      .eq('id', artifactData.id);

    return jsonResponse({
      ok: true,
      degraded,
      assistant_reply: assistantReply,
      artifact_payload: newArtifactPayload,
      artifact_status: newStatus,
      artifact_instruction: {
        operation: artifactInstruction.operation || "merge",
        status: newStatus,
        missing_inputs: missingInputs,
        updated_artifact_payload: artifactInstruction.updated_artifact_payload || {},
        validation_flags: validationFlags,
      },
    });

  } catch (error) {
    console.error("fno-copilot-chat error:", error);
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
