import { supabase } from '../../lib/supabaseClient';
import type {
  AutomationLevel,
  DiceScores,
  FrameworkScore,
  GatingDecisionLabel,
  GatingEvaluationResponse,
  GatingEvaluationResult,
  IdeaPreset,
  ReliabilityResult,
  RouteRecommendation,
  TaxonomyResult,
  TaxonomyType,
} from './aiGateTypes';

export const AI_GATE_FUNCTION = 'ai-gating-evaluate';

export const IDEA_PRESETS: IdeaPreset[] = [
  {
    id: 'support-triage',
    title: 'Customer Support Triage',
    subtitle: 'Support inbox automation',
    ideaText: 'Read inbound support emails, classify issue type, draft a reply using company policy, and escalate billing disputes to a human agent.',
    hint: 'Type III leaning into constrained autonomy.',
  },
  {
    id: 'loan-eligibility',
    title: 'Loan Eligibility Checker',
    subtitle: 'Fintech decision engine',
    ideaText: 'Determine if a user qualifies for a loan based on income, bureau score, age, existing debt, and regulatory rules.',
    hint: 'A good anti-pattern test for deterministic logic vs AI.',
  },
  {
    id: 'research-copilot',
    title: 'Policy Research Copilot',
    subtitle: 'Document-heavy assistant',
    ideaText: 'Analyze a folder of policy PDFs, answer questions with citations, compare clauses across documents, and draft a recommendation memo for the analyst.',
    hint: 'Type IV with a strong harness requirement.',
  },
  {
    id: 'lead-scoring',
    title: 'Lead Scoring',
    subtitle: 'Structured inference workflow',
    ideaText: 'Score B2B leads using CRM fields, enrichment signals, campaign source, and historical conversion data to rank the best sales opportunities.',
    hint: 'Usually better served by classical ML than an LLM.',
  },
  {
    id: 'clinical-summary',
    title: 'Clinical Summary Drafting',
    subtitle: 'Healthcare documentation assistant',
    ideaText: 'Draft a clinician-facing visit summary from free-text notes, prior history, and test results while flagging missing red-flag symptoms for review.',
    hint: 'High value, but human review must stay in the loop.',
  },
];

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
): TaxonomyResult => {
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
    'Type I': 'The task mostly relies on structured inputs and explicit rules, so deterministic code should own the decision path.',
    'Type II': 'The data is structured, but the exact logic is learned from examples, which makes classical ML the better first stop.',
    'Type III': 'Language is central, but the task is still bounded by guardrails and explicit success criteria.',
    'Type IV': 'The workflow needs interpretation, synthesis, and tool-using judgment rather than a single fixed path.',
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
): DiceScores => {
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
  const costOfError = clamp(
    3 + lowStakesSignals - highStakesSignals
  );
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

const computeReliability = (dice: DiceScores): ReliabilityResult => {
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

const computeRoute = (taxonomy: TaxonomyType, dice: DiceScores): RouteRecommendation => {
  let solver = 'Deterministic software';
  let decisionLabel: GatingDecisionLabel = 'REJECT';
  let automationLevel: AutomationLevel = 'Deterministic only';
  let reasoning = 'The problem can be solved more reliably with explicit rules than with a probabilistic model.';

  if (taxonomy === 'Type II') {
    solver = 'Classical ML scorecard';
    decisionLabel = dice.costOfError <= 2 ? 'DEFER' : 'APPROVE (Assistive)';
    automationLevel = 'Classical ML first';
    reasoning = 'The signal is mostly in structured data, so a tabular model is more economical and easier to govern than an LLM.';
  }

  if (taxonomy === 'Type III') {
    solver = 'Single-LLM pipeline with validators';
    decisionLabel = dice.costOfError <= 2 ? 'APPROVE (Assistive)' : 'APPROVE (Constrained Autonomy)';
    automationLevel = dice.costOfError <= 2 ? 'Assistive AI' : 'Constrained autonomy';
    reasoning = 'Language generation adds value here, but the workflow still needs validators and bounded output contracts.';
  }

  if (taxonomy === 'Type IV') {
    solver = 'Agentic orchestration with a deterministic harness';
    if (dice.costOfError <= 2) {
      decisionLabel = 'APPROVE (Assistive)';
      automationLevel = 'Assistive AI';
      reasoning = 'The workflow is agentic in nature, but the downside of a bad answer is too high to allow autonomous action.';
    } else if (dice.economics >= 4) {
      decisionLabel = 'APPROVE (Constrained Autonomy)';
      automationLevel = 'Constrained autonomy';
      reasoning = 'A multi-step LLM workflow is justified, but permissions should stay bounded and reversible.';
      if (dice.costOfError >= 4 && dice.determinism >= 4) {
        decisionLabel = 'APPROVE (Autonomous)';
        automationLevel = 'Autonomous agent';
        reasoning = 'The task is open-ended, low stakes, and economically attractive enough to support guarded autonomous execution.';
      }
    } else {
      decisionLabel = 'DEFER';
      automationLevel = 'Assistive AI';
      reasoning = 'The workflow shape suggests an agent, but the economics are not yet strong enough to justify the operational overhead.';
    }
  }

  return { solver, decisionLabel, automationLevel, reasoning };
};

const computeFrameworks = (
  taxonomy: TaxonomyResult,
  dice: DiceScores,
  reliability: ReliabilityResult,
  route: RouteRecommendation
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
      summary: 'This reflects how much monitoring, validation, and human review you will need to operate safely.',
    },
    {
      key: 'automation',
      label: 'Automation Readiness',
      score: routeScoreMap[route.automationLevel],
      summary: `Best route: ${route.automationLevel.toLowerCase()} via ${route.solver.toLowerCase()}.`,
    },
  ];
};

export const simulateAiGateEvaluation = (title: string, ideaText: string): GatingEvaluationResult => {
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

  const summary = `This idea maps to ${taxonomy.title.toLowerCase()} and should ${route.decisionLabel === 'REJECT' ? 'not' : ''} be built around an LLM-first decision path.`;
  const buildRecommendation =
    route.decisionLabel === 'REJECT'
      ? 'Keep AI out of the core decision path. If desired, use AI only for paraphrasing or user-facing explanations.'
      : route.decisionLabel === 'DEFER'
        ? 'The use case is interesting, but the governance and unit economics are not yet strong enough for a production-grade AI rollout.'
        : `Proceed with ${route.automationLevel.toLowerCase()} and keep the harness deterministic around the model.`;

  const conclusion =
    route.decisionLabel === 'REJECT'
      ? 'This is a classic case where AI would add variance and cost without improving the underlying product outcome.'
      : route.decisionLabel === 'DEFER'
        ? 'There is promise here, but the right next step is a tightly scoped pilot with explicit kill criteria.'
        : `The right build is not “AI everywhere”; it is ${route.solver.toLowerCase()} with carefully chosen autonomy boundaries.`;

  return {
    title,
    ideaText,
    summary,
    taxonomy,
    dice,
    reliability,
    frameworks,
    route,
    buildRecommendation,
    conclusion,
    governanceNotes: [
      'Keep the control flow deterministic; let the model handle reasoning, not state management.',
      'Define an eval set before broad rollout so the gate is evidence-based rather than intuitive.',
      'Instrument human override, fallback rates, and error categories from day one.',
    ],
    simulated: true,
  };
};

const normalizeFunctionPayload = (payload: any): any => {
  if (Array.isArray(payload)) return normalizeFunctionPayload(payload[0]);
  if (payload?.body) return normalizeFunctionPayload(payload.body);
  if (payload?.data) return normalizeFunctionPayload(payload.data);
  return payload;
};

export const evaluateIdeaWithAiGate = async (params: {
  title: string;
  ideaText: string;
  source: 'preset' | 'custom';
  presetId?: string;
}): Promise<GatingEvaluationResponse> => {
  try {
    const { data, error } = await supabase.functions.invoke(AI_GATE_FUNCTION, {
      body: {
        title: params.title,
        idea_text: params.ideaText,
        source: params.source,
        preset_id: params.presetId ?? null,
      },
    });

    if (error) throw error;

    const normalized = normalizeFunctionPayload(data);
    if (normalized?.result && normalized?.assessmentId && normalized?.ideaId) {
      return normalized as GatingEvaluationResponse;
    }
    throw new Error('Unexpected response format from AI gate function.');
  } catch {
    const fallback = simulateAiGateEvaluation(params.title, params.ideaText);
    return {
      ideaId: `preview-${Date.now()}`,
      assessmentId: `preview-${Date.now() + 1}`,
      status: 'preview',
      result: fallback,
    };
  }
};
