import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

type TaxonomyType = 'Type I' | 'Type II' | 'Type III' | 'Type IV';

type GatingDecisionLabel =
  | 'REJECT'
  | 'DEFER'
  | 'APPROVE (Assistive)'
  | 'APPROVE (Constrained Autonomy)'
  | 'APPROVE (Autonomous)';

type AutomationLevel =
  | 'Deterministic only'
  | 'Classical ML first'
  | 'Assistive AI'
  | 'Constrained autonomy'
  | 'Autonomous agent';

type FrameworkScore = {
  key: string;
  label: string;
  score: number;
  summary: string;
};

type GatingEvaluationResult = {
  title: string;
  ideaText: string;
  summary: string;
  taxonomy: {
    type: TaxonomyType;
    title: string;
    reasoning: string;
  };
  dice: {
    determinism: number;
    inputComplexity: number;
    costOfError: number;
    economics: number;
    total: number;
  };
  reliability: {
    requirement: number;
    stakes: number;
    quadrant: string;
    strategy: string;
  };
  frameworks: FrameworkScore[];
  route: {
    solver: string;
    decisionLabel: GatingDecisionLabel;
    automationLevel: AutomationLevel;
    reasoning: string;
  };
  conclusion: string;
  buildRecommendation: string;
  governanceNotes: string[];
  simulated?: boolean;
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });

const getServiceClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase service role configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey);
};

const clamp = (value: number, min = 1, max = 5) => Math.max(min, Math.min(max, value));

const hashString = (value: string) =>
  Array.from(value).reduce((acc, char) => acc + char.charCodeAt(0), 0);

const keywordCount = (text: string, keywords: string[]) =>
  keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);

const computeTaxonomy = (
  structuredSignals: number,
  unstructuredSignals: number,
  specifiableSignals: number,
  judgmentSignals: number
) => {
  const structured = structuredSignals >= unstructuredSignals;
  const highSpec = specifiableSignals >= judgmentSignals;

  let type: TaxonomyType = 'Type I';
  if (structured && highSpec) type = 'Type I';
  else if (structured) type = 'Type II';
  else if (highSpec) type = 'Type III';
  else type = 'Type IV';

  const titles: Record<TaxonomyType, string> = {
    'Type I': 'Deterministic Execution',
    'Type II': 'Structured Inference',
    'Type III': 'Bounded Language Intelligence',
    'Type IV': 'Open-Ended Reasoning Workflow',
  };

  const reasons: Record<TaxonomyType, string> = {
    'Type I': 'The use case is structured enough that explicit rules should own the decision path.',
    'Type II': 'The data is structured, but prediction still depends on learned patterns from prior examples.',
    'Type III': 'Language is central, but the task remains bounded by a clear contract and guardrails.',
    'Type IV': 'The workflow requires synthesis, planning, and investigation rather than a single predictable transform.',
  };

  return {
    type,
    title: titles[type],
    reasoning: reasons[type],
  };
};

const computeDice = (
  taxonomy: TaxonomyType,
  structuredSignals: number,
  unstructuredSignals: number,
  specifiableSignals: number,
  judgmentSignals: number,
  highStakesSignals: number,
  lowStakesSignals: number,
  scaleSignals: number,
  textHash: number
) => {
  const determinismBase: Record<TaxonomyType, number> = {
    'Type I': 1,
    'Type II': 2,
    'Type III': 3,
    'Type IV': 4,
  };
  const complexityBase: Record<TaxonomyType, number> = {
    'Type I': 1,
    'Type II': 3,
    'Type III': 4,
    'Type IV': 5,
  };

  const determinism = clamp(
    determinismBase[taxonomy] + Math.sign(judgmentSignals - specifiableSignals)
  );
  const inputComplexity = clamp(
    complexityBase[taxonomy] + Math.sign(unstructuredSignals - structuredSignals)
  );
  const costOfError = clamp(3 + lowStakesSignals - highStakesSignals);
  const economics = clamp(
    2 + scaleSignals + ((textHash % 3) === 0 ? 1 : 0) - (highStakesSignals > 1 ? 1 : 0)
  );

  return {
    determinism,
    inputComplexity,
    costOfError,
    economics,
    total: determinism + inputComplexity + costOfError + economics,
  };
};

const computeReliability = (dice: GatingEvaluationResult['dice']) => {
  const stakes = clamp(6 - dice.costOfError);
  const requirement = clamp(Math.round((6 - dice.determinism + stakes) / 2));

  let quadrant = 'High Reliability + Low Stakes';
  let strategy = 'Autonomous AI with monitoring';

  if (requirement >= 4 && stakes >= 4) {
    quadrant = 'High Reliability + High Stakes';
    strategy = 'Deterministic validators plus mandatory expert review';
  } else if (requirement < 4 && stakes >= 4) {
    quadrant = 'Low Reliability + High Stakes';
    strategy = 'Reject autonomy; redesign the workflow or narrow scope';
  } else if (requirement < 4 && stakes < 4) {
    quadrant = 'Low Reliability + Low Stakes';
    strategy = 'User-driven AI or experimental assistive mode';
  }

  return { requirement, stakes, quadrant, strategy };
};

const computeRoute = (
  taxonomy: TaxonomyType,
  dice: GatingEvaluationResult['dice']
) => {
  let solver = 'Deterministic software';
  let decisionLabel: GatingDecisionLabel = 'REJECT';
  let automationLevel: AutomationLevel = 'Deterministic only';
  let reasoning = 'Deterministic logic is more reliable and cheaper than a probabilistic model for this problem.';

  if (taxonomy === 'Type II') {
    solver = 'Classical ML scorecard';
    decisionLabel = dice.costOfError <= 2 ? 'DEFER' : 'APPROVE (Assistive)';
    automationLevel = 'Classical ML first';
    reasoning = 'The signal is mainly in structured data, so a tabular model beats an LLM on economics and observability.';
  }

  if (taxonomy === 'Type III') {
    solver = 'Single-LLM pipeline with validators';
    decisionLabel = dice.costOfError <= 2 ? 'APPROVE (Assistive)' : 'APPROVE (Constrained Autonomy)';
    automationLevel = dice.costOfError <= 2 ? 'Assistive AI' : 'Constrained autonomy';
    reasoning = 'Language intelligence adds value, but the workflow still needs bounded outputs and deterministic checks.';
  }

  if (taxonomy === 'Type IV') {
    solver = 'Agentic orchestration with a deterministic harness';
    if (dice.costOfError <= 2) {
      decisionLabel = 'APPROVE (Assistive)';
      automationLevel = 'Assistive AI';
      reasoning = 'The workflow is genuinely agentic, but humans should remain the final decision-makers because the downside is too large.';
    } else if (dice.economics >= 4) {
      decisionLabel = 'APPROVE (Constrained Autonomy)';
      automationLevel = 'Constrained autonomy';
      reasoning = 'An agent can be justified here if permissions stay narrow, reversible, and heavily monitored.';
      if (dice.costOfError >= 4 && dice.determinism >= 4) {
        decisionLabel = 'APPROVE (Autonomous)';
        automationLevel = 'Autonomous agent';
        reasoning = 'The task is open-ended but low enough in stakes to support guarded autonomous execution.';
      }
    } else {
      decisionLabel = 'DEFER';
      automationLevel = 'Assistive AI';
      reasoning = 'The workflow wants an agent, but the economics do not yet justify the operating burden.';
    }
  }

  return { solver, decisionLabel, automationLevel, reasoning };
};

const computeFrameworks = (
  taxonomy: GatingEvaluationResult['taxonomy'],
  dice: GatingEvaluationResult['dice'],
  reliability: GatingEvaluationResult['reliability'],
  route: GatingEvaluationResult['route']
): FrameworkScore[] => {
  const diceScore = Math.round((dice.total / 20) * 100);
  const governanceScore = clamp(Math.round((dice.costOfError + dice.economics) * 10), 0, 100);
  const routeScoreMap: Record<AutomationLevel, number> = {
    'Deterministic only': 22,
    'Classical ML first': 58,
    'Assistive AI': 71,
    'Constrained autonomy': 84,
    'Autonomous agent': 92,
  };
  const reliabilityScore =
    reliability.quadrant === 'High Reliability + High Stakes'
      ? 68
      : reliability.quadrant === 'Low Reliability + High Stakes'
        ? 28
        : reliability.quadrant === 'Low Reliability + Low Stakes'
          ? 76
          : 88;

  const taxonomyScoreMap: Record<TaxonomyType, number> = {
    'Type I': 20,
    'Type II': 54,
    'Type III': 81,
    'Type IV': 87,
  };

  return [
    {
      key: 'taxonomy',
      label: 'Problem Taxonomy Fit',
      score: taxonomyScoreMap[taxonomy.type],
      summary: taxonomy.reasoning,
    },
    {
      key: 'dice',
      label: 'DICE Attractiveness',
      score: diceScore,
      summary: `DICE total ${dice.total}/20 with economics at ${dice.economics}/5 and cost of error at ${dice.costOfError}/5.`,
    },
    {
      key: 'reliability',
      label: 'Reliability-Stakes Fit',
      score: reliabilityScore,
      summary: `${reliability.quadrant}. Recommended posture: ${reliability.strategy}.`,
    },
    {
      key: 'governance',
      label: 'Governance Readiness',
      score: governanceScore,
      summary: 'This reflects the monitoring, review, and override mechanisms the workflow will need in production.',
    },
    {
      key: 'automation',
      label: 'Automation Readiness',
      score: routeScoreMap[route.automationLevel],
      summary: `Best route: ${route.automationLevel.toLowerCase()} via ${route.solver.toLowerCase()}.`,
    },
  ];
};

const simulateEvaluation = (title: string, ideaText: string): GatingEvaluationResult => {
  const text = ideaText.toLowerCase();
  const textHash = hashString(text);

  const structuredSignals = keywordCount(text, [
    'score',
    'eligibility',
    'table',
    'field',
    'database',
    'crm',
    'form',
    'payment',
    'loan',
    'rule',
    'calculate',
    'pricing',
  ]);
  const unstructuredSignals = keywordCount(text, [
    'email',
    'document',
    'pdf',
    'chat',
    'summary',
    'draft',
    'research',
    'policy',
    'contract',
    'note',
    'language',
    'memo',
  ]);
  const specifiableSignals = keywordCount(text, [
    'policy',
    'guardrail',
    'rule',
    'compliance',
    'threshold',
    'eligibility',
    'calculator',
    'draft',
    'extract',
    'classify',
  ]);
  const judgmentSignals = keywordCount(text, [
    'recommend',
    'investigate',
    'reason',
    'synthesize',
    'analyze',
    'copilot',
    'compare',
    'prioritize',
    'route',
  ]);
  const highStakesSignals = keywordCount(text, [
    'loan',
    'credit',
    'clinical',
    'medical',
    'diagnosis',
    'legal',
    'fraud',
    'underwriting',
    'compliance',
    'payment',
  ]);
  const lowStakesSignals = keywordCount(text, [
    'marketing',
    'content',
    'recommendation',
    'brainstorm',
    'summary',
    'research',
    'memo',
    'draft',
  ]);
  const scaleSignals = keywordCount(text, [
    'customer',
    'sales',
    'volume',
    'inbox',
    'support',
    'workflow',
    'automate',
    'daily',
    'every',
  ]);

  const taxonomy = computeTaxonomy(
    structuredSignals,
    unstructuredSignals,
    specifiableSignals,
    judgmentSignals
  );
  const dice = computeDice(
    taxonomy.type,
    structuredSignals,
    unstructuredSignals,
    specifiableSignals,
    judgmentSignals,
    highStakesSignals,
    lowStakesSignals,
    scaleSignals,
    textHash
  );
  const reliability = computeReliability(dice);
  const route = computeRoute(taxonomy.type, dice);
  const frameworks = computeFrameworks(taxonomy, dice, reliability, route);

  const summary = `This workflow maps to ${taxonomy.title.toLowerCase()} and the smallest viable solver should be chosen before defaulting to an LLM-first build.`;
  const buildRecommendation =
    route.decisionLabel === 'REJECT'
      ? 'Keep AI out of the core decision path and use it only for explanation or UX polish if needed.'
      : route.decisionLabel === 'DEFER'
        ? 'Prototype carefully, but do not commit to a full production rollout until evals and economics are stronger.'
        : `Proceed with ${route.automationLevel.toLowerCase()} and keep the harness deterministic around the model.`;
  const conclusion =
    route.decisionLabel === 'REJECT'
      ? 'This is a strong candidate for deterministic logic, not an AI decision-maker.'
      : route.decisionLabel === 'DEFER'
        ? 'The use case is promising, but the organization should close measurement and governance gaps before scaling.'
        : `This can justify AI, but only in the architecture shape implied by the gate: ${route.solver.toLowerCase()}.`;

  return {
    title,
    ideaText,
    summary,
    taxonomy,
    dice,
    reliability,
    frameworks,
    route,
    conclusion,
    buildRecommendation,
    governanceNotes: [
      'Keep control flow deterministic and let the model handle reasoning rather than orchestration state.',
      'Define a measurable eval set before rollout so the decision stays evidence-based.',
      'Instrument override rates, hallucination classes, and rollback paths from day one.',
    ],
    simulated: true,
  };
};

const normalizeN8nPayload = (payload: any): GatingEvaluationResult | null => {
  let current = payload;
  while (Array.isArray(current) && current.length > 0) current = current[0];
  if (current?.body) current = current.body;
  if (current?.data) current = current.data;
  if (current?.result) current = current.result;
  if (!current || typeof current !== 'object') return null;

  if (current.taxonomy && current.dice && current.route) {
    return current as GatingEvaluationResult;
  }

  return null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { title, idea_text, source, preset_id } = await req.json();

    if (!title || !idea_text) {
      return jsonResponse({ error: 'Missing required fields: title, idea_text' }, 400);
    }

    const supabase = getServiceClient();

    const { data: ideaRow, error: ideaError } = await supabase
      .from('ai_gate_ideas')
      .insert({
        title,
        idea_text,
        source: source ?? 'custom',
        preset_id: preset_id ?? null,
      })
      .select('id')
      .single();

    if (ideaError || !ideaRow) {
      throw new Error(`Failed to save idea: ${ideaError?.message ?? 'unknown error'}`);
    }

    const { data: assessmentRow, error: assessmentError } = await supabase
      .from('ai_gate_assessments')
      .insert({
        idea_id: ideaRow.id,
        status: 'pending',
      })
      .select('id')
      .single();

    if (assessmentError || !assessmentRow) {
      throw new Error(`Failed to create assessment: ${assessmentError?.message ?? 'unknown error'}`);
    }

    const n8nWebhookUrl = Deno.env.get('AI_GATE_N8N_WEBHOOK_URL');
    const n8nSecret = Deno.env.get('AI_GATE_N8N_WEBHOOK_SECRET');

    let result = simulateEvaluation(title, idea_text);

    if (n8nWebhookUrl) {
      try {
        const n8nResponse = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(n8nSecret ? { 'x-n8n-secret': n8nSecret } : {}),
          },
          body: JSON.stringify({
            idea_id: ideaRow.id,
            assessment_id: assessmentRow.id,
            title,
            idea_text,
            source: source ?? 'custom',
            preset_id: preset_id ?? null,
            framework: ['taxonomy', 'dice', 'reliability', 'route', 'automation'],
          }),
        });

        if (n8nResponse.ok) {
          const payload = await n8nResponse.json();
          const normalized = normalizeN8nPayload(payload);
          if (normalized) {
            result = {
              ...normalized,
              simulated: false,
            };
          }
        }
      } catch (_) {
        // Fallback to deterministic preview result when n8n is unavailable.
      }
    }

    const { error: updateError } = await supabase
      .from('ai_gate_assessments')
      .update({
        status: 'completed',
        decision_label: result.route.decisionLabel,
        recommended_solver: result.route.solver,
        automation_level: result.route.automationLevel,
        framework_scores: result.frameworks,
        result_payload: result,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assessmentRow.id);

    if (updateError) {
      throw new Error(`Failed to persist assessment result: ${updateError.message}`);
    }

    const { error: ideaUpdateError } = await supabase
      .from('ai_gate_ideas')
      .update({
        taxonomy_type: result.taxonomy.type,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ideaRow.id);

    if (ideaUpdateError) {
      throw new Error(`Failed to persist idea classification: ${ideaUpdateError.message}`);
    }

    return jsonResponse({
      ideaId: ideaRow.id,
      assessmentId: assessmentRow.id,
      status: 'completed',
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});
