import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Anti-cheat calibration. The runner accrues score from passive distance plus
// pickups; speed scales as 10 + score*0.01. These bounds are deliberately
// generous so no legitimate run is ever rejected, while blocking the
// "instant huge score with no real play time" forgery.
const MAX_POINTS_PER_SECOND = 300;
const BASE_ALLOWANCE = 1000;        // grace for very short legit runs
const MAX_SCORE = 10_000_000;       // hard ceiling, matches old DB constraint
const ROUND_TTL_MS = 2 * 60 * 60 * 1000; // a round is valid for 2 hours

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const getServiceClient = () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = getServiceClient();
  if (!supabase) return json({ error: "Server misconfigured" }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const action = body.action;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // --- START: issue a server-side round token --------------------------------
  if (action === "start") {
    const { data, error } = await supabase
      .from("game_rounds")
      .insert({ ip })
      .select("id")
      .single();
    if (error || !data) return json({ error: "Could not start round" }, 500);
    return json({ round_id: data.id });
  }

  // --- SUBMIT: validate the round and persist the score ----------------------
  if (action === "submit") {
    const roundId = typeof body.round_id === "string" ? body.round_id : null;
    const rawName = typeof body.player_name === "string" ? body.player_name : "";
    const playerName = rawName.trim().slice(0, 20);
    const score = Math.floor(Number(body.score));

    if (!roundId) return json({ error: "Missing round_id" }, 400);
    if (playerName.length < 1) return json({ error: "Name required" }, 400);
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
      return json({ error: "Invalid score" }, 400);
    }

    const { data: round, error: roundErr } = await supabase
      .from("game_rounds")
      .select("id, started_at, used")
      .eq("id", roundId)
      .single();

    if (roundErr || !round) return json({ error: "Unknown round" }, 403);
    if (round.used) return json({ error: "Round already submitted" }, 409);

    const startedAt = new Date(round.started_at).getTime();
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > ROUND_TTL_MS) return json({ error: "Round expired" }, 403);

    const maxPlausible = BASE_ALLOWANCE + (elapsedMs / 1000) * MAX_POINTS_PER_SECOND;
    if (score > maxPlausible) {
      // Consume the round so a guessed/forged score cannot be retried.
      await supabase.from("game_rounds").update({ used: true, submitted_score: score }).eq("id", roundId);
      return json({ error: "Score rejected: implausible for elapsed play time" }, 422);
    }

    // Atomically consume the round (guards against double-submit races).
    const { data: claimed, error: claimErr } = await supabase
      .from("game_rounds")
      .update({ used: true, submitted_score: score })
      .eq("id", roundId)
      .eq("used", false)
      .select("id")
      .single();
    if (claimErr || !claimed) return json({ error: "Round already submitted" }, 409);

    const { error: insErr } = await supabase
      .from("game_leaderboard")
      .insert({ player_name: playerName, score });
    if (insErr) return json({ error: "Could not save score" }, 500);

    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
