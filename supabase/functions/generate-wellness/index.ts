import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { twin_id } = await req.json();
    if (!twin_id) {
      return new Response(JSON.stringify({ error: "twin_id is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── 1. Check Cache ─────────────────────────────────────────
    const { data: cached } = await supabase
      .from("health_wellness_programs")
      .select("*")
      .eq("twin_id", twin_id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (cached && cached.length > 0) {
      return new Response(JSON.stringify({ programs: cached, source: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 2. Collect User Data ───────────────────────────────────
    const [scoresRes, aggregatesRes, labsRes, personalRes, exerciseRes, sleepRes, memoriesRes] = await Promise.all([
      supabase.from("health_scores").select("*").eq("twin_id", twin_id),
      supabase.from("health_daily_aggregates").select("*").eq("twin_id", twin_id)
        .gte("date", new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0])
        .order("date", { ascending: false }),
      supabase.from("health_lab_parameters").select("*").eq("twin_id", twin_id)
        .order("recorded_at", { ascending: false }).limit(30),
      supabase.from("health_personal_details").select("*").eq("twin_id", twin_id).single(),
      supabase.from("health_wearable_parameters").select("*").eq("twin_id", twin_id).eq("category", "exercise")
        .order("recorded_at", { ascending: false }).limit(30),
      supabase.from("health_wearable_parameters").select("*").eq("twin_id", twin_id).eq("category", "sleep")
        .order("recorded_at", { ascending: false }).limit(20),
      supabase.from("health_twin_memories").select("*").eq("twin_id", twin_id)
        .order("created_at", { ascending: false }).limit(20),
    ]);

    const userData = {
      scores: scoresRes.data || [],
      daily_aggregates: aggregatesRes.data || [],
      lab_parameters: labsRes.data || [],
      personal_details: personalRes.data || null,
      exercise_data: exerciseRes.data || [],
      sleep_data: sleepRes.data || [],
      memories: (memoriesRes.data || []).map((m: any) => m.memory_text),
    };

    // ─── 3. Generate Programs via GPT-4o ────────────────────────
    const systemPrompt = `You are a board-certified preventive medicine specialist and wellness coach.
Given a patient's comprehensive health data, generate exactly 3-4 personalized wellness programs.

STRICT RULES:
1. Each program MUST reference at least 2 SPECIFIC data points from the patient's actual data (exact numbers, not vague references).
2. Programs should span different health domains (e.g., cardiovascular, metabolic, sleep, mental wellness, nutrition).
3. If the patient has comorbidities listed, at least ONE program must directly address management or improvement related to them.
4. Weekly plans must be realistic, specific, and progressive. Include exact durations, intensities, or targets.
5. Expected outcomes must be evidence-based and time-bound (e.g., "Reduce resting HR by 5 bpm in 6 weeks").
6. Use the patient's name in the "reason" field for personalization.
7. Prioritize programs by clinical urgency: high = needs immediate attention, medium = improvement opportunity, low = optimization/maintenance.
8. Icon must be one of: heart, dumbbell, moon, utensils, brain, shield, eye, lungs, bone, droplet

Return ONLY valid JSON matching the provided schema. Do not include any text outside the JSON.`;

    const userPrompt = `Generate personalized wellness programs for this patient.

PATIENT DATA:
${JSON.stringify(userData, null, 2)}

Return a JSON object with a "programs" array containing 3-4 programs.`;

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "wellness_programs",
            strict: true,
            schema: {
              type: "object",
              properties: {
                programs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      icon: { type: "string" },
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                      duration: { type: "string" },
                      reason: { type: "string" },
                      data_connections: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            metric: { type: "string" },
                            value: { type: "string" },
                            insight: { type: "string" },
                          },
                          required: ["metric", "value", "insight"],
                          additionalProperties: false,
                        },
                      },
                      weekly_plan: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            day: { type: "string" },
                            activity: { type: "string" },
                            target_hr: { type: "string" },
                            goal: { type: "string" },
                          },
                          required: ["day", "activity", "target_hr", "goal"],
                          additionalProperties: false,
                        },
                      },
                      expected_outcomes: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                    required: ["title", "icon", "priority", "duration", "reason", "data_connections", "weekly_plan", "expected_outcomes"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["programs"],
              additionalProperties: false,
            },
          },
        },
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("OpenAI error:", errText);
      return new Response(JSON.stringify({ error: "Failed to generate programs", details: errText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 502,
      });
    }

    const aiResult = await openaiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify({ error: "Empty response from AI" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI response", raw: content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const programs = parsed.programs || [];

    // ─── 4. Cache: Delete old + insert new ──────────────────────
    await supabase
      .from("health_wellness_programs")
      .delete()
      .eq("twin_id", twin_id);

    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const rows = programs.map((p: any) => ({
      twin_id,
      title: p.title,
      icon: p.icon || "heart",
      priority: p.priority || "medium",
      duration: p.duration,
      reason: p.reason,
      data_connections: p.data_connections || [],
      weekly_plan: p.weekly_plan || [],
      expected_outcomes: p.expected_outcomes || [],
      expires_at: expiresAt,
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from("health_wellness_programs")
      .insert(rows)
      .select();

    if (insertErr) {
      console.error("Insert error:", insertErr);
    }

    return new Response(
      JSON.stringify({ programs: inserted || rows, source: "generated" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
