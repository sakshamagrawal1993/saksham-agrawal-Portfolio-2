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

type PublicVisibility = 'show' | 'show_redacted' | 'hide';
type AssessmentStatus = 'pending' | 'running' | 'completed' | 'rejected' | 'failed' | 'preview';
type ResultSource = 'n8n' | 'fallback' | 'decider';
type DiceDimensionKey = 'determinism' | 'inputComplexity' | 'costOfError' | 'economics';

type DiceDimension = {
  key: DiceDimensionKey;
  label: string;
  score: number;
  scoreMeaning: string;
  reasoning: string;
};

type LegitimacyResult = {
  isLegitimate: boolean;
  status:
    | 'accepted'
    | 'needs_more_detail'
    | 'rejected_spam'
    | 'rejected_unsafe'
    | 'rejected_prompt_injection'
    | 'rejected_sensitive_data'
    | 'rejected_not_an_idea';
  confidence: number;
  category: string;
  publicVisibility: PublicVisibility;
  redactedIdeaText: string;
  generatedTitle: string;
  rejectionReason: string | null;
  improvementPrompt: string | null;
  flags: string[];
};

type AgentOutput = {
  key: string;
  agentName: string;
  status: 'completed' | 'rejected' | 'failed' | 'skipped';
  summary: string;
  output: Record<string, unknown>;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
};

type CoverageManifestItem = {
  present: boolean;
  agentKey: string;
  requiredFields: string[];
  missingFields: string[];
  sourcePath: string;
};

type CoverageManifest = Record<
  | 'legitimacy'
  | 'taxonomy'
  | 'dice'
  | 'reliability'
  | 'anti_patterns'
  | 'economics_readiness'
  | 'synthesis'
  | 'schema_audit'
  | 'n8n_contract',
  CoverageManifestItem
>;

type FrameworkScore = {
  key: string;
  label: string;
  score: number;
  summary: string;
};

type RedFlagResult = {
  key: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  triggered: boolean;
  explanation: string;
  mitigation: string;
};

type GatingEvaluationResult = {
  schemaVersion?: string;
  workflowExecutionId?: string | null;
  title: string;
  ideaText: string;
  summary: string;
  legitimacy?: LegitimacyResult;
  taxonomy: {
    type: TaxonomyType;
    title: string;
    reasoning: string;
    inputStructure?: string;
    solutionSpecifiability?: string;
    decompositionNotes?: string;
  };
  dice: {
    determinism: number;
    inputComplexity: number;
    costOfError: number;
    economics: number;
    total: number;
    rav?: number;
    rationale?: Record<string, string>;
    dimensions?: DiceDimension[];
  };
  reliability: {
    requirement: number;
    stakes: number;
    quadrant: string;
    strategy: string;
    humanReviewRequirement?: string;
    quadrantReasoning?: string;
    axisMeanings?: {
      requirement: string;
      stakes: string;
    };
  };
  redFlags?: RedFlagResult[];
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
  agentOutputs?: AgentOutput[];
  coverageManifest?: CoverageManifest;
  simulated?: boolean;
};

type WorkflowPayload = {
  schemaVersion: string;
  workflowExecutionId: string | null;
  status: AssessmentStatus;
  legitimacy: LegitimacyResult;
  agentOutputs: AgentOutput[];
  result: GatingEvaluationResult | null;
};

const SCHEMA_VERSION = 'ai-gate-result-v2';
const REQUEST_SCHEMA_VERSION = 'ai-gate-request-v2';
const PROMPT_VERSION = 'ai-gate-multi-agent-v2-2026-05-13';

const DICE_SCORE_MEANINGS: Record<DiceDimensionKey, Record<number, string>> = {
  determinism: {
    1: 'One correct answer; explicit rules should own the path.',
    2: 'Mostly deterministic with a messy edge-case layer.',
    3: 'Fixed outcome, but wording or interpretation varies.',
    4: 'Judgment-heavy with several acceptable outputs.',
    5: 'Creative or subjective; variance is part of the value.',
  },
  inputComplexity: {
    1: 'Structured, finite inputs such as fields or dropdowns.',
    2: 'Mostly structured with a small amount of messy text.',
    3: 'Schema exists, but values and patterns are varied.',
    4: 'Unstructured language/documents with bounded scope.',
    5: 'Open-ended, multi-source, highly variable context.',
  },
  costOfError: {
    1: 'Catastrophic or non-recoverable failure path.',
    2: 'High consequence; human review is mandatory.',
    3: 'Material but recoverable business/user impact.',
    4: 'Low-to-moderate impact with clear rollback paths.',
    5: 'Low stakes; individual errors are cheap.',
  },
  economics: {
    1: 'Negative unit economics versus simpler methods.',
    2: 'Research-only value; weak production ROI.',
    3: 'Borderline; needs strict pilot scope.',
    4: 'Positive unit economics with manageable ops cost.',
    5: 'Structural advantage that simpler systems cannot match.',
  },
};

const DICE_LABELS: Record<DiceDimensionKey, string> = {
  determinism: 'Determinism',
  inputComplexity: 'Input Complexity',
  costOfError: 'Cost of Error',
  economics: 'Economics',
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

const nowIso = () => new Date().toISOString();
const durationMs = (startedAt: string) => Math.max(0, Date.now() - new Date(startedAt).getTime());
const clamp = (value: number, min = 1, max = 5) => Math.max(min, Math.min(max, value));
const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const envFlagEnabled = (name: string) => Deno.env.get(name)?.toLowerCase() === 'true';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const buildDiceDimensions = (
  scores: Pick<GatingEvaluationResult['dice'], 'determinism' | 'inputComplexity' | 'costOfError' | 'economics'>,
  rationale?: GatingEvaluationResult['dice']['rationale']
): DiceDimension[] =>
  (['determinism', 'inputComplexity', 'costOfError', 'economics'] as DiceDimensionKey[]).map((key) => {
    const score = scores[key];
    return {
      key,
      label: DICE_LABELS[key],
      score,
      scoreMeaning: DICE_SCORE_MEANINGS[key][score] || 'Score meaning unavailable.',
      reasoning: rationale?.[key] || 'Reasoning was not provided by the assessment.',
    };
  });

const hashString = (value: string) =>
  Array.from(value).reduce((acc, char) => acc + char.charCodeAt(0), 0);

const keywordCount = (text: string, keywords: string[]) =>
  keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);

const redactIdeaText = (ideaText: string) =>
  ideaText
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email redacted]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone redacted]')
    .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '[id redacted]')
    .trim();

const makeTitle = (title: string | undefined, ideaText: string) => {
  const cleanTitle = String(title || '').trim();
  if (cleanTitle && cleanTitle.toLowerCase() !== 'custom idea') return cleanTitle.slice(0, 90);
  const firstSentence = ideaText.split(/[.!?\n]/)[0]?.trim() || ideaText.trim();
  return firstSentence.length > 90 ? `${firstSentence.slice(0, 87)}...` : firstSentence || 'Custom Idea';
};

const assessLegitimacy = (title: string, ideaText: string): LegitimacyResult => {
  const text = ideaText.toLowerCase();
  const redactedIdeaText = redactIdeaText(ideaText);
  const generatedTitle = makeTitle(title, redactedIdeaText);
  const flags: string[] = [];

  if (ideaText.trim().length < 40) {
    return {
      isLegitimate: false,
      status: 'needs_more_detail',
      confidence: 0.94,
      category: 'insufficient_context',
      publicVisibility: 'show',
      redactedIdeaText,
      generatedTitle,
      rejectionReason: 'The idea is too short to evaluate reliably.',
      improvementPrompt: 'Describe the user, the input, the decision being made, and what output or action you expect.',
      flags: ['too_short'],
    };
  }

  if (/(ignore previous|system prompt|developer message|jailbreak|bypass guardrail|reveal.*prompt)/i.test(ideaText)) {
    flags.push('prompt_injection');
    return {
      isLegitimate: false,
      status: 'rejected_prompt_injection',
      confidence: 0.91,
      category: 'prompt_injection',
      publicVisibility: 'hide',
      redactedIdeaText: '',
      generatedTitle: 'Hidden submission',
      rejectionReason: 'The submission appears to be a prompt-injection attempt rather than a product idea.',
      improvementPrompt: 'Submit a product or workflow idea without instructions to override the evaluator.',
      flags,
    };
  }

  if (/(build a bomb|make a bomb|kill people|steal credentials|phishing kit|malware|ransomware)/i.test(ideaText)) {
    flags.push('unsafe_request');
    return {
      isLegitimate: false,
      status: 'rejected_unsafe',
      confidence: 0.9,
      category: 'unsafe_request',
      publicVisibility: 'hide',
      redactedIdeaText: '',
      generatedTitle: 'Hidden submission',
      rejectionReason: 'The submission requests unsafe or harmful behavior.',
      improvementPrompt: 'Submit a safe product idea that can be evaluated for AI suitability.',
      flags,
    };
  }

  if (redactedIdeaText !== ideaText.trim()) {
    flags.push('possible_sensitive_data');
  }

  const productSignals = keywordCount(text, [
    'app',
    'tool',
    'workflow',
    'feature',
    'product',
    'system',
    'automate',
    'agent',
    'user',
    'customer',
    'analyze',
    'classify',
    'score',
    'draft',
    'summarize',
    'recommend',
    'detect',
    'route',
    'decide',
  ]);

  if (productSignals === 0) {
    return {
      isLegitimate: false,
      status: 'rejected_not_an_idea',
      confidence: 0.78,
      category: 'not_a_product_idea',
      publicVisibility: 'show_redacted',
      redactedIdeaText,
      generatedTitle,
      rejectionReason: 'The submission does not clearly describe a product, feature, workflow, or decision process.',
      improvementPrompt: 'Reframe it as a product idea with a user, input, decision, and expected output.',
      flags: ['missing_product_context', ...flags],
    };
  }

  return {
    isLegitimate: true,
    status: 'accepted',
    confidence: flags.length ? 0.82 : 0.9,
    category: 'product_idea',
    publicVisibility: flags.includes('possible_sensitive_data') ? 'show_redacted' : 'show',
    redactedIdeaText,
    generatedTitle,
    rejectionReason: null,
    improvementPrompt: null,
    flags,
  };
};

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
    'Type II': 'The data is structured, but prediction depends on learned patterns from prior examples.',
    'Type III': 'Language is central, but the task remains bounded by a clear contract and guardrails.',
    'Type IV': 'The workflow requires synthesis, planning, and investigation rather than a single predictable transform.',
  };

  return {
    type,
    title: titles[type],
    reasoning: reasons[type],
    inputStructure: structured ? 'structured' : 'unstructured',
    solutionSpecifiability: highSpec ? 'high' : 'low',
    decompositionNotes:
      structuredSignals > 0 && unstructuredSignals > 0
        ? 'This idea likely has multiple sub-tasks; keep deterministic sub-flows separate from model reasoning.'
        : 'The workflow can be assessed as one dominant problem type for the first gate.',
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

  const determinism = clamp(determinismBase[taxonomy] + Math.sign(judgmentSignals - specifiableSignals));
  const inputComplexity = clamp(complexityBase[taxonomy] + Math.sign(unstructuredSignals - structuredSignals));
  const costOfError = clamp(3 + lowStakesSignals - highStakesSignals);
  const economics = clamp(2 + scaleSignals + ((textHash % 3) === 0 ? 1 : 0) - (highStakesSignals > 1 ? 1 : 0));
  const total = determinism + inputComplexity + costOfError + economics;
  const rationale = {
    determinism: determinism <= 2 ? 'The decision path appears rule-heavy.' : 'The task allows multiple valid outputs or judgment paths.',
    inputComplexity: inputComplexity >= 4 ? 'Inputs are likely unstructured or semantically varied.' : 'Inputs appear structured enough for simpler methods.',
    costOfError: costOfError <= 2 ? 'Failures could create material user, financial, legal, or safety risk.' : 'Individual errors look recoverable.',
    economics: economics >= 4 ? 'Scale or labor savings can plausibly justify operational AI cost.' : 'The value case needs tighter proof before scaling.',
  };

  return {
    determinism,
    inputComplexity,
    costOfError,
    economics,
    total,
    rav: determinism + inputComplexity + economics - costOfError,
    rationale,
    dimensions: buildDiceDimensions({ determinism, inputComplexity, costOfError, economics }, rationale),
  };
};

const computeReliability = (dice: GatingEvaluationResult['dice']) => {
  const stakes = clamp(6 - dice.costOfError);
  const requirement = clamp(Math.round((6 - dice.determinism + stakes) / 2));

  let quadrant = 'High Reliability + Low Stakes';
  let strategy = 'Autonomous AI with monitoring';
  let humanReviewRequirement = 'Sampled audit is sufficient if the action is reversible.';

  if (requirement >= 4 && stakes >= 4) {
    quadrant = 'High Reliability + High Stakes';
    strategy = 'Deterministic validators plus mandatory expert review';
    humanReviewRequirement = 'Human approval is required before any external action.';
  } else if (requirement < 4 && stakes >= 4) {
    quadrant = 'Low Reliability + High Stakes';
    strategy = 'Reject autonomy; redesign the workflow or narrow scope';
    humanReviewRequirement = 'AI may draft or triage only; it should not decide.';
  } else if (requirement < 4 && stakes < 4) {
    quadrant = 'Low Reliability + Low Stakes';
    strategy = 'User-driven AI or experimental assistive mode';
    humanReviewRequirement = 'Human review can be optional if output stays low-impact.';
  }

  return {
    requirement,
    stakes,
    quadrant,
    strategy,
    humanReviewRequirement,
    quadrantReasoning: `Reliability need is ${requirement}/5 and failure stakes are ${stakes}/5, placing the idea in ${quadrant}.`,
    axisMeanings: {
      requirement: requirement >= 4 ? 'The product needs consistently correct outputs before users can trust it.' : 'The product can tolerate exploratory or imperfect outputs.',
      stakes: stakes >= 4 ? 'A wrong answer can create high user, financial, legal, safety, or compliance impact.' : 'A wrong answer is likely recoverable or low impact.',
    },
  };
};

const computeRoute = (taxonomy: TaxonomyType, dice: GatingEvaluationResult['dice']) => {
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
      reasoning = 'The workflow is genuinely agentic, but humans should remain final decision-makers because the downside is too large.';
    } else if (dice.economics >= 4) {
      decisionLabel = 'APPROVE (Constrained Autonomy)';
      automationLevel = 'Constrained autonomy';
      reasoning = 'An agent can be justified if permissions stay narrow, reversible, and heavily monitored.';
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

const computeRedFlags = (ideaText: string, taxonomy: TaxonomyType, dice: GatingEvaluationResult['dice']): RedFlagResult[] => {
  const text = ideaText.toLowerCase();
  const flags: RedFlagResult[] = [
    {
      key: 'golden_hammer',
      label: 'Golden Hammer',
      severity: taxonomy === 'Type I' ? 'high' : 'medium',
      triggered: taxonomy === 'Type I' || text.includes('use ai') || text.includes('llm'),
      explanation: 'The idea may be starting from AI as the tool instead of proving AI is needed.',
      mitigation: 'Compare against a deterministic or classical ML baseline before approving model work.',
    },
    {
      key: 'zero_tolerance',
      label: 'Zero Tolerance',
      severity: dice.costOfError <= 2 ? 'high' : 'low',
      triggered: dice.costOfError <= 2,
      explanation: 'The workflow has a high consequence path where probabilistic errors are costly.',
      mitigation: 'Restrict AI to drafting or analysis and require human approval or deterministic validation.',
    },
    {
      key: 'overkill_architecture',
      label: 'Overkill Architecture',
      severity: taxonomy === 'Type I' || taxonomy === 'Type II' ? 'medium' : 'low',
      triggered: taxonomy === 'Type I' || taxonomy === 'Type II',
      explanation: 'A multi-agent or LLM-first build may be more complex than the problem requires.',
      mitigation: 'Use the smallest viable solver and reserve agents for genuinely open-ended reasoning.',
    },
  ];

  return flags;
};

const computeFrameworks = (
  taxonomy: GatingEvaluationResult['taxonomy'],
  dice: GatingEvaluationResult['dice'],
  reliability: GatingEvaluationResult['reliability'],
  route: GatingEvaluationResult['route'],
  redFlags: RedFlagResult[]
): FrameworkScore[] => {
  const diceScore = Math.round((dice.total / 20) * 100);
  const governanceScore = clampScore((dice.costOfError + dice.economics) * 10 - redFlags.filter((flag) => flag.triggered).length * 8);
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
      summary: 'This reflects monitoring, review, privacy, cost, and rollback readiness.',
    },
    {
      key: 'automation',
      label: 'Automation Readiness',
      score: routeScoreMap[route.automationLevel],
      summary: `Best route: ${route.automationLevel.toLowerCase()} via ${route.solver.toLowerCase()}.`,
    },
  ];
};

const simulateEvaluation = (title: string, ideaText: string, legitimacy: LegitimacyResult): GatingEvaluationResult => {
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

  const taxonomy = computeTaxonomy(structuredSignals, unstructuredSignals, specifiableSignals, judgmentSignals);
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
  const redFlags = computeRedFlags(ideaText, taxonomy.type, dice);
  const frameworks = computeFrameworks(taxonomy, dice, reliability, route, redFlags);

  const agentOutputs: AgentOutput[] = [
    {
      key: 'legitimacy',
      agentName: 'Legitimacy Decider',
      status: 'completed',
      summary: legitimacy.isLegitimate ? 'Accepted as a product/workflow idea.' : legitimacy.rejectionReason || 'Rejected by decider.',
      output: legitimacy as unknown as Record<string, unknown>,
    },
    {
      key: 'taxonomy',
      agentName: 'Problem Taxonomy Agent',
      status: 'completed',
      summary: `${taxonomy.type}: ${taxonomy.title}.`,
      output: taxonomy,
    },
    {
      key: 'dice',
      agentName: 'DICE Agent',
      status: 'completed',
      summary: `DICE total ${dice.total}/20 with RAV ${dice.rav}.`,
      output: dice,
    },
    {
      key: 'reliability',
      agentName: 'Reliability-Stakes Agent',
      status: 'completed',
      summary: reliability.quadrant,
      output: reliability,
    },
    {
      key: 'anti_patterns',
      agentName: 'Anti-Pattern Agent',
      status: 'completed',
      summary: `${redFlags.filter((flag) => flag.triggered).length} red flags triggered.`,
      output: { redFlags },
    },
    {
      key: 'economics_readiness',
      agentName: 'Economics and Readiness Agent',
      status: 'completed',
      summary: `Economics ${dice.economics}/5; governance burden follows cost-of-error ${dice.costOfError}/5.`,
      output: {
        economics: dice.economics,
        readinessGaps: [
          'Define a golden evaluation set.',
          'Add rollback and cost controls before production rollout.',
        ],
      },
    },
    {
      key: 'synthesis',
      agentName: 'Synthesis and Route Agent',
      status: 'completed',
      summary: `${route.decisionLabel}: ${route.solver}.`,
      output: route,
    },
  ];

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
    schemaVersion: SCHEMA_VERSION,
    workflowExecutionId: null,
    title: legitimacy.generatedTitle || title,
    ideaText: legitimacy.redactedIdeaText || ideaText,
    summary,
    legitimacy,
    taxonomy,
    dice,
    reliability,
    redFlags,
    frameworks,
    route,
    conclusion,
    buildRecommendation,
    governanceNotes: [
      'Keep control flow deterministic and let the model handle reasoning rather than orchestration state.',
      'Define a measurable eval set before rollout so the decision stays evidence-based.',
      'Instrument override rates, hallucination classes, public-history redaction, and rollback paths from day one.',
    ],
    agentOutputs,
    simulated: true,
  };
};

const unwrap = (payload: any): any => {
  let current = payload;
  while (Array.isArray(current) && current.length > 0) current = current[0];
  if (current?.body) return unwrap(current.body);
  if (current?.data) return unwrap(current.data);
  return current;
};

const normalizeAgentOutputs = (value: any): AgentOutput[] =>
  Array.isArray(value)
    ? value.map((item, index) => ({
        key: String(item.key || item.agentKey || `agent_${index + 1}`),
        agentName: String(item.agentName || item.name || `Agent ${index + 1}`),
        status: item.status || 'completed',
        summary: String(item.summary || ''),
        output: item.output && typeof item.output === 'object' ? item.output : item,
        startedAt: item.startedAt ?? item.started_at ?? null,
        completedAt: item.completedAt ?? item.completed_at ?? null,
        durationMs: Number.isFinite(Number(item.durationMs ?? item.duration_ms))
          ? Number(item.durationMs ?? item.duration_ms)
          : null,
      }))
    : [];

const hasValue = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
};

const buildCoverageItem = (
  result: GatingEvaluationResult,
  agentKey: string,
  requiredFields: string[],
  sourcePath: string,
  values: Record<string, unknown>
): CoverageManifestItem => {
  const missingFields = requiredFields.filter((field) => !hasValue(values[field]));
  const agentPresent = agentKey === 'schema_audit' || agentKey === 'n8n_contract'
    ? true
    : (result.agentOutputs ?? []).some((agent) => agent.key === agentKey && agent.status !== 'failed');

  return {
    present: agentPresent && missingFields.length === 0,
    agentKey,
    requiredFields,
    missingFields,
    sourcePath,
  };
};

const buildCoverageManifest = (result: GatingEvaluationResult, source: ResultSource): CoverageManifest => ({
  legitimacy: buildCoverageItem(result, 'legitimacy', ['legitimacy'], 'result.legitimacy', {
    legitimacy: result.legitimacy,
  }),
  taxonomy: buildCoverageItem(result, 'taxonomy', ['type', 'reasoning', 'inputStructure', 'solutionSpecifiability'], 'result.taxonomy', {
    type: result.taxonomy?.type,
    reasoning: result.taxonomy?.reasoning,
    inputStructure: result.taxonomy?.inputStructure,
    solutionSpecifiability: result.taxonomy?.solutionSpecifiability,
  }),
  dice: buildCoverageItem(result, 'dice', ['dimensions', 'total', 'rav'], 'result.dice', {
    dimensions: result.dice?.dimensions,
    total: result.dice?.total,
    rav: result.dice?.rav,
  }),
  reliability: buildCoverageItem(result, 'reliability', ['quadrant', 'strategy', 'humanReviewRequirement'], 'result.reliability', {
    quadrant: result.reliability?.quadrant,
    strategy: result.reliability?.strategy,
    humanReviewRequirement: result.reliability?.humanReviewRequirement,
  }),
  anti_patterns: buildCoverageItem(result, 'anti_patterns', ['redFlags'], 'result.redFlags', {
    redFlags: result.redFlags,
  }),
  economics_readiness: buildCoverageItem(result, 'economics_readiness', ['governanceNotes'], 'result.governanceNotes', {
    governanceNotes: result.governanceNotes,
  }),
  synthesis: buildCoverageItem(result, 'synthesis', ['route', 'summary', 'conclusion', 'buildRecommendation'], 'result.route', {
    route: result.route,
    summary: result.summary,
    conclusion: result.conclusion,
    buildRecommendation: result.buildRecommendation,
  }),
  schema_audit: buildCoverageItem(result, 'schema_audit', ['schemaVersion'], 'result.schemaVersion', {
    schemaVersion: result.schemaVersion,
  }),
  n8n_contract: buildCoverageItem(result, 'n8n_contract', ['workflowExecutionId'], 'result.workflowExecutionId', {
    workflowExecutionId: source === 'n8n' ? result.workflowExecutionId : 'fallback-not-required',
  }),
});

const missingCoverage = (manifest: CoverageManifest) =>
  Object.entries(manifest)
    .filter(([, item]) => !item.present)
    .map(([key, item]) => `${key}${item.missingFields.length ? `:${item.missingFields.join(',')}` : ''}`);

const normalizeWorkflowPayload = (payload: any, fallbackLegitimacy: LegitimacyResult): WorkflowPayload | null => {
  const current = unwrap(payload);
  if (!current || typeof current !== 'object') return null;

  const resultCandidate = current.result ?? current.output ?? current;
  const result = resultCandidate?.taxonomy && resultCandidate?.dice && resultCandidate?.route
    ? resultCandidate as GatingEvaluationResult
    : null;
  const legitimacy = (current.legitimacy ?? result?.legitimacy ?? fallbackLegitimacy) as LegitimacyResult;
  const agentOutputs = normalizeAgentOutputs(current.agentOutputs ?? current.agent_outputs ?? result?.agentOutputs);
  const status: AssessmentStatus =
    current.status === 'rejected' || legitimacy?.isLegitimate === false
      ? 'rejected'
      : current.status === 'failed'
        ? 'failed'
        : 'completed';

  return {
    schemaVersion: String(current.schemaVersion || current.schema_version || result?.schemaVersion || SCHEMA_VERSION),
    workflowExecutionId: current.workflowExecutionId || current.workflow_execution_id || result?.workflowExecutionId || null,
    status,
    legitimacy,
    agentOutputs,
    result: result
      ? {
          ...result,
          schemaVersion: String(current.schemaVersion || current.schema_version || result.schemaVersion || SCHEMA_VERSION),
          workflowExecutionId: current.workflowExecutionId || current.workflow_execution_id || result.workflowExecutionId || null,
          legitimacy,
          agentOutputs: agentOutputs.length ? agentOutputs : result.agentOutputs,
          simulated: false,
        }
      : null,
  };
};

const buildRejectedResponse = (title: string, ideaText: string, legitimacy: LegitimacyResult): GatingEvaluationResult => ({
  schemaVersion: SCHEMA_VERSION,
  workflowExecutionId: null,
  title: legitimacy.generatedTitle || title,
  ideaText: legitimacy.redactedIdeaText || ideaText,
  summary: legitimacy.rejectionReason || 'The submission was rejected by the legitimacy gate.',
  legitimacy,
  taxonomy: {
    type: 'Type I',
    title: 'Deterministic Execution',
    reasoning: 'No taxonomy evaluation was run because the submission did not pass the legitimacy gate.',
    inputStructure: 'unknown',
    solutionSpecifiability: 'unknown',
    decompositionNotes: 'Resubmit with a concrete user, input, decision, and output.',
  },
  dice: {
    determinism: 1,
    inputComplexity: 1,
    costOfError: 1,
    economics: 1,
    total: 4,
    rav: 2,
    rationale: {
      determinism: 'Not evaluated.',
      inputComplexity: 'Not evaluated.',
      costOfError: 'Not evaluated.',
      economics: 'Not evaluated.',
    },
    dimensions: buildDiceDimensions(
      { determinism: 1, inputComplexity: 1, costOfError: 1, economics: 1 },
      {
        determinism: 'Not evaluated because the idea did not pass the legitimacy gate.',
        inputComplexity: 'Not evaluated because the idea did not pass the legitimacy gate.',
        costOfError: 'Not evaluated because the idea did not pass the legitimacy gate.',
        economics: 'Not evaluated because the idea did not pass the legitimacy gate.',
      }
    ),
  },
  reliability: {
    requirement: 1,
    stakes: 1,
    quadrant: 'Low Reliability + Low Stakes',
    strategy: 'Do not evaluate until the idea is made concrete.',
    humanReviewRequirement: 'No review required; user should revise the submission.',
    quadrantReasoning: 'The framework agents did not run because the submission was rejected before assessment.',
    axisMeanings: {
      requirement: 'Not evaluated.',
      stakes: 'Not evaluated.',
    },
  },
  redFlags: [],
  frameworks: [],
  route: {
    solver: 'Deterministic software',
    decisionLabel: 'DEFER',
    automationLevel: 'Deterministic only',
    reasoning: 'The idea needs more detail or violates the submission gate.',
  },
  conclusion: legitimacy.rejectionReason || 'This submission cannot be evaluated yet.',
  buildRecommendation: legitimacy.improvementPrompt || 'Rewrite the idea with a concrete workflow and try again.',
  governanceNotes: [
    'The public history only shows safe or redacted rejected submissions.',
    'The legitimacy gate runs before framework agents to avoid wasting workflow cost.',
    'Unsafe, spam, and prompt-injection submissions are hidden from public history.',
  ],
  agentOutputs: [
    {
      key: 'legitimacy',
      agentName: 'Legitimacy Decider',
      status: 'rejected',
      summary: legitimacy.rejectionReason || 'Rejected by the legitimacy gate.',
      output: legitimacy as unknown as Record<string, unknown>,
    },
  ],
  simulated: false,
});

const tryInsertAgentSteps = async (supabase: any, assessmentId: string, agentOutputs: AgentOutput[]) => {
  if (!agentOutputs.length) return;
  const rows = agentOutputs.map((agent, index) => ({
    assessment_id: assessmentId,
    sequence: index + 1,
    agent_key: agent.key,
    agent_name: agent.agentName,
    status: agent.status,
    summary: agent.summary,
    output_payload: agent.output ?? {},
    started_at: agent.startedAt ?? null,
    completed_at: agent.completedAt ?? null,
    duration_ms: agent.durationMs ?? null,
  }));
  const { error } = await supabase.from('ai_gate_agent_steps').insert(rows);
  if (error) console.warn(`Failed to persist AI gate agent steps: ${error.message}`);
};

const persistFailedAssessment = async (
  supabase: any,
  assessmentId: string,
  startedAt: string,
  message: string
) => {
  const failedAt = nowIso();
  const { error } = await supabase
    .from('ai_gate_assessments')
    .update({
      status: 'failed',
      failed_at: failedAt,
      duration_ms: durationMs(startedAt),
      error_message: message,
      result_source: 'n8n',
      schema_version: SCHEMA_VERSION,
      prompt_version: PROMPT_VERSION,
      model_versions: { workflow: 'n8n', fallback: false },
      updated_at: failedAt,
    })
    .eq('id', assessmentId);

  if (error) {
    throw new Error(`Failed to persist assessment failure: ${error.message}`);
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startedAt = nowIso();

  try {
    const {
      title: rawTitle,
      idea_text,
      source,
      preset_id,
      user_session_id,
      client_metadata,
    } = await req.json();

    const ideaText = String(idea_text || '').trim();
    const title = makeTitle(rawTitle, ideaText);

    if (!ideaText) {
      return jsonResponse({ error: 'Missing required field: idea_text' }, 400);
    }

    if (ideaText.length > 3000) {
      return jsonResponse({ error: 'Idea text must be 3,000 characters or fewer.' }, 400);
    }

    const supabase = getServiceClient();
    const localLegitimacy = assessLegitimacy(title, ideaText);

    const { data: ideaRow, error: ideaError } = await supabase
      .from('ai_gate_ideas')
      .insert({
        title,
        display_title: localLegitimacy.generatedTitle,
        idea_text: ideaText,
        public_idea_text: localLegitimacy.redactedIdeaText,
        source: source ?? 'custom',
        preset_id: preset_id ?? null,
        legitimacy_status: localLegitimacy.status,
        legitimacy_confidence: localLegitimacy.confidence,
        public_visibility: localLegitimacy.publicVisibility,
        user_session_id: user_session_id ?? null,
        client_metadata: client_metadata && typeof client_metadata === 'object' ? client_metadata : {},
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
        result_source: 'n8n',
        schema_version: SCHEMA_VERSION,
        prompt_version: PROMPT_VERSION,
        legitimacy_payload: localLegitimacy,
        started_at: startedAt,
      })
      .select('id')
      .single();

    if (assessmentError || !assessmentRow) {
      throw new Error(`Failed to create assessment: ${assessmentError?.message ?? 'unknown error'}`);
    }

    await supabase
      .from('ai_gate_assessments')
      .update({ status: 'running', started_at: startedAt, updated_at: nowIso() })
      .eq('id', assessmentRow.id);

    const n8nWebhookUrl = Deno.env.get('AI_GATE_N8N_WEBHOOK_URL');
    const n8nSecret = Deno.env.get('AI_GATE_N8N_WEBHOOK_SECRET');
    const allowFallback = envFlagEnabled('AI_GATE_ALLOW_FALLBACK');
    let workflowPayload: WorkflowPayload | null = null;
    let resultSource: ResultSource = 'n8n';

    if (n8nWebhookUrl && n8nSecret) {
      try {
        const normalizedPath = new URL(n8nWebhookUrl).pathname.toLowerCase();
        if (normalizedPath.includes('trading-agents-run')) {
          throw new Error('AI Gate webhook is incorrectly pointed to Trading Agents workflow');
        }

        const n8nResponse = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-n8n-secret': n8nSecret,
          },
          body: JSON.stringify({
            schema_version: REQUEST_SCHEMA_VERSION,
            idea_id: ideaRow.id,
            assessment_id: assessmentRow.id,
            title,
            idea_text: ideaText,
            source: source ?? 'custom',
            preset_id: preset_id ?? null,
            framework: [
              'legitimacy',
              'taxonomy',
              'dice',
              'reliability',
              'anti_patterns',
              'economics',
              'synthesis',
            ],
          }),
        });

        if (!n8nResponse.ok) {
          const errorText = await n8nResponse.text().catch(() => '');
          throw new Error(`n8n returned ${n8nResponse.status}${errorText ? `: ${errorText.slice(0, 500)}` : ''}`);
        }

        workflowPayload = normalizeWorkflowPayload(await n8nResponse.json(), localLegitimacy);
        if (!workflowPayload) {
          throw new Error('n8n returned an unrecognized AI Gate payload');
        }
      } catch (error) {
        const message = errorMessage(error);
        if (!allowFallback) {
          console.error(`AI Gate n8n call failed: ${message}`);
          await persistFailedAssessment(supabase, assessmentRow.id, startedAt, message);
          return jsonResponse({
            ideaId: ideaRow.id,
            assessmentId: assessmentRow.id,
            status: 'failed',
            error: message,
          }, 502);
        }
        console.warn(`AI Gate n8n call failed, using explicit fallback: ${message}`);
      }
    } else {
      const missingConfig = [
        !n8nWebhookUrl ? 'AI_GATE_N8N_WEBHOOK_URL' : null,
        !n8nSecret ? 'AI_GATE_N8N_WEBHOOK_SECRET' : null,
      ].filter(Boolean).join(', ');
      console.warn(`${missingConfig} missing; using local fallback evaluator`);
    }

    if (!workflowPayload) {
      resultSource = 'fallback';
      if (!localLegitimacy.isLegitimate) {
        workflowPayload = {
          schemaVersion: SCHEMA_VERSION,
          workflowExecutionId: null,
          status: 'rejected',
          legitimacy: localLegitimacy,
          agentOutputs: [
            {
              key: 'legitimacy',
              agentName: 'Legitimacy Decider',
              status: 'rejected',
              summary: localLegitimacy.rejectionReason || 'Rejected by fallback legitimacy gate.',
              output: localLegitimacy as unknown as Record<string, unknown>,
            },
          ],
          result: buildRejectedResponse(title, ideaText, localLegitimacy),
        };
      } else {
        const fallbackResult = simulateEvaluation(title, ideaText, localLegitimacy);
        workflowPayload = {
          schemaVersion: SCHEMA_VERSION,
          workflowExecutionId: null,
          status: 'completed',
          legitimacy: localLegitimacy,
          agentOutputs: fallbackResult.agentOutputs ?? [],
          result: fallbackResult,
        };
      }
    }

    const completedAt = nowIso();
    const finalStatus = workflowPayload.status === 'rejected' ? 'rejected' : workflowPayload.status === 'failed' ? 'failed' : 'completed';
    const finalResult = workflowPayload.result ?? buildRejectedResponse(title, ideaText, workflowPayload.legitimacy);
    const agentOutputs = workflowPayload.agentOutputs.length
      ? workflowPayload.agentOutputs
      : finalResult.agentOutputs ?? [];
    if (!Array.isArray(finalResult.dice.dimensions)) {
      finalResult.dice.dimensions = buildDiceDimensions(
        {
          determinism: finalResult.dice.determinism,
          inputComplexity: finalResult.dice.inputComplexity,
          costOfError: finalResult.dice.costOfError,
          economics: finalResult.dice.economics,
        },
        finalResult.dice.rationale
      );
    }
    finalResult.reliability.quadrantReasoning =
      finalResult.reliability.quadrantReasoning ||
      `Reliability need is ${finalResult.reliability.requirement}/5 and failure stakes are ${finalResult.reliability.stakes}/5, placing the idea in ${finalResult.reliability.quadrant}.`;
    finalResult.reliability.axisMeanings = finalResult.reliability.axisMeanings || {
      requirement:
        finalResult.reliability.requirement >= 4
          ? 'The product needs consistently correct outputs before users can trust it.'
          : 'The product can tolerate exploratory or imperfect outputs.',
      stakes:
        finalResult.reliability.stakes >= 4
          ? 'A wrong answer can create high user, financial, legal, safety, or compliance impact.'
          : 'A wrong answer is likely recoverable or low impact.',
    };

    finalResult.schemaVersion = workflowPayload.schemaVersion;
    finalResult.workflowExecutionId = workflowPayload.workflowExecutionId;
    finalResult.legitimacy = workflowPayload.legitimacy;
    finalResult.agentOutputs = agentOutputs;
    finalResult.simulated = resultSource === 'fallback';
    finalResult.coverageManifest = buildCoverageManifest(finalResult, resultSource);

    const missingContractSections = missingCoverage(finalResult.coverageManifest);
    if (resultSource === 'n8n' && finalStatus === 'completed' && missingContractSections.length) {
      const message = `failed_contract: missing ${missingContractSections.join('; ')}`;
      await persistFailedAssessment(supabase, assessmentRow.id, startedAt, message);
      return jsonResponse({
        ideaId: ideaRow.id,
        assessmentId: assessmentRow.id,
        status: 'failed_contract',
        error: message,
        coverageManifest: finalResult.coverageManifest,
      }, 502);
    }

    const { error: updateError } = await supabase
      .from('ai_gate_assessments')
      .update({
        status: finalStatus,
        decision_label: finalStatus === 'rejected' ? null : finalResult.route.decisionLabel,
        recommended_solver: finalStatus === 'rejected' ? null : finalResult.route.solver,
        automation_level: finalStatus === 'rejected' ? null : finalResult.route.automationLevel,
        framework_scores: finalResult.frameworks ?? [],
        result_payload: finalResult,
        legitimacy_payload: workflowPayload.legitimacy,
        agent_outputs: agentOutputs,
        red_flags: finalResult.redFlags ?? [],
        workflow_execution_id: workflowPayload.workflowExecutionId,
        result_source: finalStatus === 'rejected' ? 'decider' : resultSource,
        schema_version: workflowPayload.schemaVersion,
        prompt_version: PROMPT_VERSION,
        model_versions: { workflow: 'n8n', fallback: resultSource === 'fallback' },
        completed_at: completedAt,
        duration_ms: durationMs(startedAt),
        updated_at: completedAt,
      })
      .eq('id', assessmentRow.id);

    if (updateError) {
      throw new Error(`Failed to persist assessment result: ${updateError.message}`);
    }

    const { error: ideaUpdateError } = await supabase
      .from('ai_gate_ideas')
      .update({
        display_title: workflowPayload.legitimacy.generatedTitle || finalResult.title,
        public_idea_text: workflowPayload.legitimacy.redactedIdeaText || finalResult.ideaText,
        taxonomy_type: finalStatus === 'rejected' ? null : finalResult.taxonomy.type,
        legitimacy_status: workflowPayload.legitimacy.status,
        legitimacy_confidence: workflowPayload.legitimacy.confidence,
        public_visibility: workflowPayload.legitimacy.publicVisibility,
        updated_at: completedAt,
      })
      .eq('id', ideaRow.id);

    if (ideaUpdateError) {
      throw new Error(`Failed to persist idea classification: ${ideaUpdateError.message}`);
    }

    await tryInsertAgentSteps(supabase, assessmentRow.id, agentOutputs);

    return jsonResponse({
      ideaId: ideaRow.id,
      assessmentId: assessmentRow.id,
      status: finalStatus,
      resultSource: finalStatus === 'rejected' ? 'decider' : resultSource,
      schemaVersion: workflowPayload.schemaVersion,
      workflowExecutionId: workflowPayload.workflowExecutionId,
      createdAt: startedAt,
      completedAt,
      durationMs: durationMs(startedAt),
      legitimacy: workflowPayload.legitimacy,
      agentOutputs,
      result: finalResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});
