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

    // ─── 2. Collect User Data (lean selects to minimize tokens) ────
    const [scoresRes, aggregatesRes, labsRes, personalRes, exerciseRes, sleepRes, memoriesRes] = await Promise.all([
      supabase.from("health_scores").select("category,score").eq("twin_id", twin_id),
      supabase.from("health_daily_aggregates").select("date,parameter_name,aggregate_value,unit").eq("twin_id", twin_id)
        .gte("date", new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0])
        .order("date", { ascending: false }),
      supabase.from("health_lab_parameters").select("parameter_name,value,unit,recorded_at").eq("twin_id", twin_id)
        .order("recorded_at", { ascending: false }),
      supabase.from("health_personal_details").select("name,age,gender,height_cm,weight_kg,blood_type,co_morbidities,location").eq("twin_id", twin_id).single(),
      supabase.from("health_wearable_parameters").select("parameter_name,value,unit,recorded_at").eq("twin_id", twin_id).eq("category", "exercise")
        .order("recorded_at", { ascending: false }).limit(10),
      supabase.from("health_wearable_parameters").select("parameter_name,value,unit,recorded_at").eq("twin_id", twin_id).eq("category", "sleep")
        .order("recorded_at", { ascending: false }).limit(7),
      supabase.from("health_twin_memories").select("memory_text").eq("twin_id", twin_id)
        .order("created_at", { ascending: false }).limit(10),
    ]);

    // Compact the payload further — group aggregates by parameter
    const aggregatesByParam: Record<string, {dates: string[], values: number[], unit: string}> = {};
    for (const row of (aggregatesRes.data || [])) {
      if (!aggregatesByParam[row.parameter_name]) {
        aggregatesByParam[row.parameter_name] = { dates: [], values: [], unit: row.unit };
      }
      aggregatesByParam[row.parameter_name].dates.push(row.date);
      aggregatesByParam[row.parameter_name].values.push(row.aggregate_value);
    }

    const userData = {
      personal: personalRes.data || null,
      scores: scoresRes.data || [],
      weekly_aggregates: aggregatesByParam,
      latest_labs: (labsRes.data || []).map((r: any) => ({ name: r.parameter_name, value: r.value, unit: r.unit, date: r.recorded_at?.split("T")[0] })),
      recent_exercise: (exerciseRes.data || []).map((r: any) => ({ name: r.parameter_name, value: r.value, unit: r.unit })),
      recent_sleep: (sleepRes.data || []).map((r: any) => ({ name: r.parameter_name, value: r.value, unit: r.unit })),
      memories: (memoriesRes.data || []).map((m: any) => m.memory_text),
    };

    // ─── 3. Generate Programs via gpt-4o-mini ───────────────────
    const systemPrompt = `You are a preventive medicine specialist. Given patient health data, generate exactly 3 personalized wellness programs.
Rules: Reference ≥2 specific data points (exact numbers) per program. Cover different health domains. Address comorbidities if present. Icon must be one of: heart, dumbbell, moon, utensils, brain, shield.
Return ONLY valid JSON.`;

    const userPrompt = `Generate 3 wellness programs for this patient. Return JSON with "programs" array.

PATIENT DATA:
${JSON.stringify(userData)}`;

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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
