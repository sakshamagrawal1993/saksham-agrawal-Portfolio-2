import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { playground_state, computed_scores } = await req.json();

    if (!playground_state || !computed_scores) {
      return new Response(JSON.stringify({ error: "playground_state and computed_scores are required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // ─── 1. Format Payload for LLM ──────────────────────────────
    const userData = {
      parameters: playground_state,
      scores: computed_scores,
    };

    // ─── 2. Generate Programs via gpt-4o-mini ───────────────────
    const systemPrompt = `You are a preventive medicine and health simulation expert. 
Given a set of SIMULATED health parameters and their resulting scores, generate exactly 3 personalized wellness programs.

CRITICAL RULES:
1. Acknowledge that this is a SIMULATION.
2. Reference specific simulated data points (e.g., "Since you simulated a 3-hour sleep duration...").
3. Provide high-depth interventions including data connections, a weekly plan, and expected outcomes.
4. Icon must be one of: heart, dumbbell, moon, utensils, brain, shield.
5. Priority must be high, medium, or low.
6. Return ONLY valid JSON matching the requested schema.`;

    const userPrompt = `Generate 3 wellness programs based on this SIMULATED data. Return JSON with a "programs" array.

SIMULATION DATA:
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
      return new Response(JSON.stringify({ error: "Failed to generate simulation programs", details: errText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 502,
      });
    }

    const aiResult = await openaiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;
    
    if (!content) {
      return new Response(JSON.stringify({ error: "No plans generated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const parsed = JSON.parse(content);
    return new Response(
      JSON.stringify({ programs: parsed.programs, source: "simulation_ai" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
