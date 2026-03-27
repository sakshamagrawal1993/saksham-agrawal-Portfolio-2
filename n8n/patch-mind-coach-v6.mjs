import fs from 'fs';
import { fileURLToPath } from 'url';

const path = new URL('./mind-coach-therapist-chat-v6-robust.json', import.meta.url);
const wf = JSON.parse(fs.readFileSync(path, 'utf8'));

wf.name = 'Mind Coach - Therapist Chat & Discovery (v6 Robust)';
wf.pinData = {};
wf.versionId = crypto.randomUUID();
wf.meta = {
  ...wf.meta,
  templateCredsSetupCompleted: false,
};
wf.settings = {
  executionOrder: 'v1',
  binaryMode: 'separate',
};

const therapistSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: true,
      properties: {
        reply: {
          type: 'string',
          description:
            'Single conversational paragraph; therapeutic tone; ends with a gentle reflection or question.',
        },
        is_session_close: { type: 'boolean' },
        dynamic_in_chat_exercise: {
          description: 'Catalog exercise id (e.g. box_breathing) or JSON null when no exercise.',
          anyOf: [{ type: 'string' }, { type: 'null' }],
        },
        dynamic_content: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['exercise', 'exercise_card'] },
            payload: { type: 'string' },
          },
          required: ['type', 'payload'],
        },
      },
      required: ['reply', 'is_session_close', 'dynamic_in_chat_exercise'],
    },
    {
      type: 'object',
      additionalProperties: true,
      properties: {
        output: {
          type: 'object',
          additionalProperties: true,
          properties: {
            reply: { type: 'string' },
            is_session_close: { type: 'boolean' },
            dynamic_in_chat_exercise: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
            },
            dynamic_content: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['exercise', 'exercise_card'] },
                payload: { type: 'string' },
              },
              required: ['type', 'payload'],
            },
          },
          required: ['reply', 'is_session_close', 'dynamic_in_chat_exercise'],
        },
      },
      required: ['output'],
    },
  ],
};

const formatFinalCode = `/**
 * FORMAT FINAL RESPONSE (v6)
 * Unwraps therapist parser output whether flat or nested under "output".
 * Normalizes dynamic_content.type exercise_card -> exercise for API consistency.
 */

const webhookNode = $("Webhook1").first();
const therapistNode = $("Therapist Agent1").first();
if (!therapistNode) throw new Error("Therapist Agent output not found.");

const data = webhookNode.json.body || webhookNode.json || {};
const rawOutput = therapistNode.json.output;

function unwrapTherapist(o) {
  if (o == null || typeof o !== "object") return {};
  if (typeof o.reply === "string" || typeof o.is_session_close === "boolean") return o;
  if (o.output && typeof o.output === "object") {
    const inner = o.output;
    if (typeof inner.reply === "string" || typeof inner.is_session_close === "boolean") return inner;
  }
  return o;
}

let therapistOutput = unwrapTherapist(rawOutput);
if (typeof rawOutput === "string") {
  therapistOutput = { reply: rawOutput };
}

const reply =
  therapistOutput.reply || (typeof rawOutput === "string" ? rawOutput : "");

let dynamicContent = therapistOutput.dynamic_content || null;
if (dynamicContent && dynamicContent.type === "exercise_card") {
  dynamicContent = { ...dynamicContent, type: "exercise" };
}

const slug =
  therapistOutput.dynamic_in_chat_exercise ?? dynamicContent?.payload ?? null;

const finalResponse = {
  reply,
  session_state: data.session_state || "active",
  pathway: data.pathway || "engagement_rapport_and_assessment",
  is_session_close: therapistOutput.is_session_close === true,
  dynamic_in_chat_exercise: slug,
  guardrail_status: "passed",
  crisis_detected: false,
};

if (dynamicContent) {
  finalResponse.dynamic_content = dynamicContent;
}

try {
  const discoveryNode = $("Discovery Agent1").first();
  if (discoveryNode?.json?.output && typeof discoveryNode.json.output === "object") {
    const disc = discoveryNode.json.output;
    if (disc.dynamic_theme != null) finalResponse.dynamic_theme = disc.dynamic_theme;
    if (disc.suggested_pathway != null) finalResponse.suggested_pathway = disc.suggested_pathway;
    if (typeof disc.pathway_confidence === "number")
      finalResponse.pathway_confidence = disc.pathway_confidence;
  }
} catch (e) {}

return [{ json: finalResponse }];`;

const promptBuilderCode = `/**
 * PROMPT BUILDER (v6)
 * Fixes invalid JS from v5; adds strict JSON rules for structured parser.
 */

const webhookNode = $("Webhook1").first();
if (!webhookNode) throw new Error("Webhook node not found.");

const data = webhookNode.json.body || webhookNode.json || {};

const pd = data.profile || {};
const memories = data.memories || [];
const activeTasks = data.recent_tasks_assigned || [];
const messages = data.messages || [];

const coachPrompt = data.coach_prompt || "You are an empathetic, non-judgmental mental health coach.";
const phasePrompt = data.phase_prompt || "Focus on building therapeutic rapport.";
const theme = data.dynamic_theme || "Not yet identified";
const messageCount = data.message_count || 1;
const profileId = data.profile_id || "";
const sessionId = data.session_id || "";
const isGreeting = data.is_system_greeting || false;

const personalDetails = [
  "Name: " + (pd.name || "Unknown"),
  "Age: " + (pd.age || "Unknown"),
  "Gender: " + (pd.gender || "Unknown"),
  "Concerns: " + (Array.isArray(pd.concerns) ? pd.concerns.join(", ") : pd.concerns || "Not specified"),
].join("\\n");

const mem0 = memories[0];
const memoriesStr = mem0
  ? String(mem0.memory_text || mem0.text || "")
  : "  None recorded.";

const transcript = messages
  .slice(-15)
  .map(
    (m) =>
      "  " + (m.role === "user" ? "Client" : "Therapist") + ": " + String(m.content || "")
  )
  .join("\\n");

let pacingInstruction = "";
let shouldRunDiscovery = false;

if (isGreeting) {
  pacingInstruction =
    "\\n[GREETING]\\nGreet " +
    (pd.name || "there") +
    " warmly. Introduce yourself. Reference their concerns. Set is_session_close to false.";
} else if (messageCount >= 3 && messageCount % 5 === 0) {
  pacingInstruction =
    "\\n[SYSTEM] Turn " +
    messageCount +
    ". Recommend a clinical pathway. Set is_session_close to false.";
  shouldRunDiscovery = true;
}

const systemPrompt = [
  coachPrompt,
  "",
  phasePrompt,
  "",
  "### MEMORY (CRITICAL)",
  "1. Keep one consolidated clinical memory for the client.",
  "2. When the client shares a significant persistent fact, update that memory.",
  '3. Call "Save Clinical Memory" with the FULL merged memory_text, profile_id, source_session_id, memory_type "life_context".',
  "",
  "[CLIENT PROFILE]",
  personalDetails,
  "",
  "[CONSOLIDATED CLINICAL MEMORY]",
  memoriesStr,
  "",
  "[CURRENT CLINICAL THEME]",
  theme,
  "",
  "[DYNAMIC EXERCISE LIBRARY]",
  "- Breathing: box_breathing, 4_7_8_breathing, diaphragmatic_breathing",
  "- Grounding: 5_4_3_2_1_senses, body_scan, progressive_muscle_relaxation",
  "- Meditation: calm_mind, focus_anchor, sleep_wind_down, gratitude_reflection",
  "",
  "### EXERCISE TRIGGER",
  "For acute anxiety/panic/stress, suggest a relevant exercise.",
  'Set dynamic_in_chat_exercise to the EXERCISE_ID or JSON null.',
  'If you include dynamic_content, use type "exercise" or "exercise_card" and payload = same id.',
  "",
  "[SESSION TRANSCRIPT (last 15)]",
  transcript,
  "",
  pacingInstruction,
  "",
  "### STRICT STRUCTURED OUTPUT (READ CAREFULLY)",
  "After any tool calls, your FINAL assistant message must be valid JSON ONLY (no markdown fences, no prose outside JSON).",
  "Either:",
  "  A) Top-level keys: reply (string), is_session_close (boolean), dynamic_in_chat_exercise (string or null). Optional dynamic_content: { type, payload }.",
  "  OR B) One top-level key \\"output\\" whose value is that same object.",
  'dynamic_content.type must be exactly \\"exercise\\" or \\"exercise_card\\".',
  "Use JSON null for dynamic_in_chat_exercise when no exercise (not the string \\"null\\").",
  "",
  "### OPERATIONAL PROTOCOL",
  "1. Detect new significant facts.",
  '2. If needed, CALL "Save Clinical Memory" first.',
  "3. Then emit ONLY the final JSON as specified above.",
].join("\\n");

return [
  {
    json: {
      systemPrompt,
      userMessage: data.message_text || "",
      profileId,
      sessionId,
      shouldRunDiscovery,
      messageCount,
    },
  },
];`;

for (const node of wf.nodes) {
  if (node.name === 'Therapist Output Parser1') {
    node.parameters.inputSchema = JSON.stringify(therapistSchema, null, 2);
  }
  if (node.name === 'Therapist Model (GPT-4o)1') {
    node.parameters.options = node.parameters.options || {};
    node.parameters.options.maxTokens = 1200;
    node.parameters.options.temperature = 0.45;
  }
  if (node.name === 'Format Final Response1') {
    node.parameters.jsCode = formatFinalCode;
  }
  if (node.name === 'Prompt Builder1') {
    node.parameters.jsCode = promptBuilderCode;
  }
  if (node.name === 'Crisis Screening Agent1') {
    const sm = node.parameters.options?.systemMessage || '';
    node.parameters.options.systemMessage = sm.replace('Analyze Othe user', 'Analyze the user');
  }
  if (node.name === 'Discovery Agent1') {
    node.parameters.text =
      "={{ 'Full session transcript:\\n' + ($('Webhook1').item.json.body?.messages || $('Webhook1').item.json.messages || []).slice(-20).map(m => (m.role === 'user' ? 'Client' : 'Therapist') + ': ' + m.content).join('\\n') + '\\n\\nTherapist latest reply: ' + ($json.output?.reply || $json.output?.output?.reply || (typeof $json.output === 'string' ? $json.output : '')) }}";
  }
}

fs.writeFileSync(path, JSON.stringify(wf, null, 2) + '\n');
console.log('Patched', fileURLToPath(path));
