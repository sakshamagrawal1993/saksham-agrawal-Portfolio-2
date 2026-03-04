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

    const userData = {
      parameters: playground_state,
      scores: computed_scores,
    };

    // ─── STEP 1: Generate Health Summary ───────────────────────────
    const summarySystemPrompt = `You are a medical data analyst. 
Given simulated health parameters and scores, provide a concise (max 100 words) summary of the user's current health status. 
PRIORitize evaluating the actual values provided in the data payload. Pay special attention to any extreme vitals, poor environmental metrics (like high AQI or UV), or active co-morbidities (like Asthma or Diabetes).
Analyze how these factors interact with existing baseline data to create a "What-If" health trajectory. Do NOT hallucinate values not present in the data.
Acknowledge this is a simulation.`;

    const summaryResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: summarySystemPrompt },
          { role: "user", content: `Review this simulation data and provide a summary:\n${JSON.stringify(userData)}` },
        ],
        temperature: 0.7,
      }),
    });

    if (!summaryResponse.ok) {
      throw new Error(`OpenAI Summary Error: ${await summaryResponse.text()}`);
    }

    const summaryResult = await summaryResponse.json();
    const healthSummary = summaryResult.choices?.[0]?.message?.content || "No summary generated.";

    // ─── STEP 2: Generate Wellness Plans ────────────────────────────
    const planSystemPrompt = `You are a preventive medicine and health simulation expert.
Generate exactly 3 personalized wellness plans based on the user's health summary and actual simulation data.

CRITICAL RULES:
1. Output MUST include the health_summary provided.
2. Icon must be one of: heart, dumbbell, moon, utensils, brain, shield.
3. Priority MUST be High, Medium, or Low.
4. Focus on the most significant data points: Prioritize creating plans that address the most severe out-of-range metrics, environmental risks, or active co-morbidities found in the user's data. 
5. CRITICAL: Reference specific simulated data points ACCURATELY. Do NOT invent or assume values (e.g., if AQI is 45 in the data, you must use 45, do not invent extreme values). Use ONLY the provided JSON.
6. Return ONLY valid JSON matching the schema.`;

    const planUserPrompt = `
HEALTH SUMMARY: ${healthSummary}
SIMULATION DATA: ${JSON.stringify(userData)}

Generate 3 plans in JSON format.`;

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: planSystemPrompt },
          { role: "user", content: planUserPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "wellness_generation",
            strict: true,
            schema: {
              type: "object",
              properties: {
                health_summary: { type: "string" },
                programs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      plan_name: { type: "string" },
                      plan_heading: { type: "string" },
                      plan_duration: { type: "string" },
                      plan_priority: { type: "string", enum: ["High", "Medium", "Low"] },
                      icon: { type: "string" },
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
                      weekly_plan_activities: {
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
                    required: ["plan_name", "plan_heading", "plan_duration", "plan_priority", "icon", "data_connections", "weekly_plan_activities", "expected_outcomes"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["health_summary", "programs"],
              additionalProperties: false,
            },
          },
        },
        temperature: 0.7,
      }),
    });

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI Plan Error: ${await openaiResponse.text()}`);
    }

    const aiResult = await openaiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No plans generated");
    }

    const parsed = JSON.parse(content);
    return new Response(
      JSON.stringify({ 
          health_summary: parsed.health_summary,
          programs: parsed.programs, 
          source: "simulation_ai_v2" 
      }),
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
