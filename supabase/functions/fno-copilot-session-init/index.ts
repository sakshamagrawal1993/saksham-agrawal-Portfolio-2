import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fno-copilot-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WorkflowType =
  | "ask_ai"
  | "create_trade"
  | "create_algo_strategy"
  | "option_screener";

type ArtifactType = "answer" | "trade" | "algo_strategy" | "screener";

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const getSupabase = () => {
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

const isWorkflowType = (value: unknown): value is WorkflowType =>
  value === "ask_ai" ||
  value === "create_trade" ||
  value === "create_algo_strategy" ||
  value === "option_screener";

const artifactTypeForWorkflow = (workflowType: WorkflowType): ArtifactType => {
  switch (workflowType) {
    case "ask_ai":
      return "answer";
    case "create_algo_strategy":
      return "algo_strategy";
    case "option_screener":
      return "screener";
    case "create_trade":
    default:
      return "trade";
  }
};

const artifactTitleForType = (artifactType: ArtifactType): string => {
  switch (artifactType) {
    case "answer":
      return "Ask AI answer";
    case "algo_strategy":
      return "Draft algo strategy";
    case "screener":
      return "Draft option screener";
    case "trade":
    default:
      return "Draft trade";
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!requireServiceSecret(req)) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabase = getSupabase();
  if (!supabase) return jsonResponse({ ok: false, error: "Internal Server Error: No DB" }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const workflowType = body?.workflow_type;
    const callerUserId = await getCallerUserId(supabase, req);
    const requestedUserId = typeof body?.user_id === "string" ? body.user_id : null;
    if (callerUserId && requestedUserId && callerUserId !== requestedUserId) {
      return jsonResponse({ ok: false, error: "User mismatch" }, 403);
    }
    const userId = callerUserId ?? requestedUserId;
    const symbol = typeof body?.symbol === "string" ? body.symbol : null;
    const screenContext = typeof body?.screen_context === "string" ? body.screen_context : null;

    if (!isWorkflowType(workflowType)) {
      return jsonResponse({ ok: false, error: "Invalid workflow_type" }, 400);
    }

    const artifactType = artifactTypeForWorkflow(workflowType);
    const sessionInsert = {
      user_id: userId,
      workflow_type: workflowType,
      symbol,
      screen_context: screenContext,
      state: "waiting_input",
      messages: [],
      extracted_spec: {},
      missing_inputs: [],
    };

    const { data: sessionData, error: sessionErr } = await supabase
      .from("fno_ai_sessions")
      .insert(sessionInsert)
      .select("id, workflow_type")
      .single();

    if (sessionErr || !sessionData) {
      throw new Error(sessionErr?.message || "Failed to create AI session");
    }

    const artifactInsert = {
      ai_session_id: sessionData.id,
      user_id: userId,
      artifact_type: artifactType,
      title: artifactTitleForType(artifactType),
      payload: {},
      validation_flags: [],
      status: artifactType === "answer" ? "ready" : "draft",
    };

    const { data: artifactData, error: artifactErr } = await supabase
      .from("fno_ai_artifacts")
      .insert(artifactInsert)
      .select("id, artifact_type, payload, status")
      .single();

    if (artifactErr || !artifactData) {
      throw new Error(artifactErr?.message || "Failed to create AI artifact");
    }

    return jsonResponse({
      ok: true,
      session_id: sessionData.id,
      workflow_type: sessionData.workflow_type,
      artifact_id: artifactData.id,
      artifact_type: artifactData.artifact_type,
      artifact_payload: artifactData.payload,
      artifact_status: artifactData.status,
    });
  } catch (error) {
    console.error("fno-copilot-session-init error:", error);
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
