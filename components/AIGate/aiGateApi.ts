import { supabase } from '../../lib/supabaseClient';
import type {
  AgentOutput,
  AutomationLevel,
  CoverageManifest,
  DiceDimension,
  DiceDimensionKey,
  DiceScores,
  FrameworkScore,
  GatingDecisionLabel,
  GatingEvaluationHistoryItem,
  GatingEvaluationResponse,
  GatingEvaluationResult,
  IdeaPreset,
  LegitimacyResult,
  RedFlagResult,
  ReliabilityResult,
  ResultSource,
  RouteRecommendation,
  TaxonomyResult,
  TaxonomyType,
} from './aiGateTypes';

export const AI_GATE_FUNCTION = 'ai-gating-evaluate';

const SCHEMA_VERSION = 'ai-gate-result-v2';
export const AI_GATE_MIN_IDEA_LENGTH = 40;
export const AI_GATE_MAX_IDEA_LENGTH = 3000;

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
  {
    id: 'invoice-audit',
    title: 'Invoice Exception Audit',
    subtitle: 'Finance controls',
    ideaText: 'Review vendor invoices against purchase orders, flag mismatched line items, draft an explanation, and route exceptions to finance reviewers.',
    hint: 'A hybrid test for deterministic checks plus language explanation.',
  },
  {
    id: 'meeting-brief',
    title: 'Sales Meeting Brief',
    subtitle: 'Account prep assistant',
    ideaText: 'Summarize CRM notes, recent emails, support tickets, and news before a sales meeting, then suggest three account-specific talking points.',
    hint: 'Good bounded language workflow with low direct stakes.',
  },
  {
    id: 'refund-approvals',
    title: 'Refund Approval Bot',
    subtitle: 'Customer policy gate',
    ideaText: 'Decide whether a customer refund should be approved based on order history, policy rules, account tier, complaint text, and fraud signals.',
    hint: 'Useful for testing autonomy boundaries and policy validators.',
  },
  {
    id: 'contract-risk',
    title: 'Contract Risk Screener',
    subtitle: 'Legal review support',
    ideaText: 'Read supplier contracts, extract risky clauses, compare them against approved fallback language, and prepare a review memo for legal counsel.',
    hint: 'Type III/IV with explainability and review requirements.',
  },
  {
    id: 'pricing-recommendation',
    title: 'Dynamic Pricing Advisor',
    subtitle: 'Revenue workflow',
    ideaText: 'Recommend weekly price changes using inventory levels, competitor prices, demand forecasts, margin targets, and promotional constraints.',
    hint: 'Structured inference may beat an LLM-first architecture.',
  },
  {
    id: 'candidate-screening',
    title: 'Candidate Screening Assistant',
    subtitle: 'Hiring workflow',
    ideaText: 'Review resumes and job descriptions, identify relevant experience, draft interview questions, and flag candidates for recruiter review.',
    hint: 'Bias, explainability, and human review matter.',
  },
  {
    id: 'incident-postmortem',
    title: 'Incident Postmortem Drafting',
    subtitle: 'Engineering operations',
    ideaText: 'Analyze incident timeline logs, Slack updates, deployment metadata, and support tickets to draft a postmortem with action items.',
    hint: 'Good fit for bounded synthesis with evidence grounding.',
  },
  {
    id: 'medical-prior-auth',
    title: 'Prior Authorization Assistant',
    subtitle: 'Healthcare ops',
    ideaText: 'Review clinical notes and insurance policy rules to prepare a prior authorization packet and identify missing documentation for staff.',
    hint: 'High value, but not autonomous due to clinical and compliance risk.',
  },
  {
    id: 'knowledge-base-maintenance',
    title: 'Knowledge Base Maintainer',
    subtitle: 'Support content ops',
    ideaText: 'Detect outdated help-center articles from support ticket trends, product changelogs, and user feedback, then draft updates for review.',
    hint: 'Low-stakes language workflow with strong economics.',
  },
  {
    id: 'expense-policy',
    title: 'Expense Policy Checker',
    subtitle: 'Back-office automation',
    ideaText: 'Check employee expense claims against travel policy, receipt fields, merchant metadata, and exception rules before routing approvals.',
    hint: 'Often deterministic first, with AI only for messy receipt text.',
  },
];

export const DICE_SCORE_MEANINGS: Record<DiceDimensionKey, Record<number, string>> = {
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

const buildDiceDimensions = (
  scores: Pick<DiceScores, 'determinism' | 'inputComplexity' | 'costOfError' | 'economics'>,
  rationale?: DiceScores['rationale']
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

const clamp = (value: number, min = 1, max = 5) => Math.max(min, Math.min(max, value));
const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

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

const makeTitle = (title: string, ideaText: string) => {
  const cleanTitle = title.trim();
  if (cleanTitle && cleanTitle.toLowerCase() !== 'custom idea') return cleanTitle.slice(0, 90);
  const firstSentence = ideaText.split(/[.!?\n]/)[0]?.trim() || ideaText.trim();
  return firstSentence.length > 90 ? `${firstSentence.slice(0, 87)}...` : firstSentence || 'Custom Idea';
};

const getAnonymousSessionId = () => {
  if (typeof window === 'undefined') return undefined;
  const key = 'ai_gate_session_id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const generated = crypto.randomUUID ? crypto.randomUUID() : `ai-gate-${Date.now()}`;
  window.localStorage.setItem(key, generated);
  return generated;
};

const assessLegitimacy = (title: string, ideaText: string): LegitimacyResult => {
  const redactedIdeaText = redactIdeaText(ideaText);
  const generatedTitle = makeTitle(title, redactedIdeaText);
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
      improvementPrompt: 'Describe the user, input, decision, and output you expect.',
      flags: ['too_short'],
    };
  }

  return {
    isLegitimate: true,
    status: 'accepted',
    confidence: redactedIdeaText === ideaText.trim() ? 0.9 : 0.82,
    category: 'product_idea',
    publicVisibility: redactedIdeaText === ideaText.trim() ? 'show' : 'show_redacted',
    redactedIdeaText,
    generatedTitle,
    rejectionReason: null,
    improvementPrompt: null,
    flags: redactedIdeaText === ideaText.trim() ? [] : ['possible_sensitive_data'],
  };
};

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
    inputStructure: structured ? 'structured' : 'unstructured',
    solutionSpecifiability: highSpec ? 'high' : 'low',
    decompositionNotes:
      structuredSignals > 0 && unstructuredSignals > 0
        ? 'Decompose deterministic sub-tasks from language or reasoning sub-tasks before choosing an architecture.'
        : 'The dominant workflow can be assessed as one problem type for the first gate.',
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

  const determinism = clamp(determinismBase[taxonomy] + Math.sign(judgmentSignals - specifiableSignals));
  const inputComplexity = clamp(complexityBase[taxonomy] + Math.sign(unstructuredSignals - structuredSignals));
  const costOfError = clamp(3 + lowStakesSignals - highStakesSignals);
  const economics = clamp(2 + scaleSignals + ((textHash % 3) === 0 ? 1 : 0) - (highStakesSignals > 1 ? 1 : 0));
  const total = determinism + inputComplexity + costOfError + economics;

  return {
    determinism,
    inputComplexity,
    costOfError,
    economics,
    total,
    rav: determinism + inputComplexity + economics - costOfError,
    rationale: {
      determinism: determinism <= 2 ? 'The decision path appears rule-heavy.' : 'The task allows judgment or multiple valid outputs.',
      inputComplexity: inputComplexity >= 4 ? 'Inputs are likely unstructured or semantically varied.' : 'Inputs appear structured enough for simpler methods.',
      costOfError: costOfError <= 2 ? 'Failures could create material user, financial, legal, or safety risk.' : 'Individual errors look recoverable.',
      economics: economics >= 4 ? 'Scale or labor savings can justify operational AI cost.' : 'The value case needs tighter proof before scaling.',
    },
    dimensions: buildDiceDimensions(
      { determinism, inputComplexity, costOfError, economics },
      {
        determinism: determinism <= 2 ? 'The decision path appears rule-heavy.' : 'The task allows judgment or multiple valid outputs.',
        inputComplexity: inputComplexity >= 4 ? 'Inputs are likely unstructured or semantically varied.' : 'Inputs appear structured enough for simpler methods.',
        costOfError: costOfError <= 2 ? 'Failures could create material user, financial, legal, or safety risk.' : 'Individual errors look recoverable.',
        economics: economics >= 4 ? 'Scale or labor savings can justify operational AI cost.' : 'The value case needs tighter proof before scaling.',
      }
    ),
  };
};

const computeReliability = (dice: DiceScores): ReliabilityResult => {
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

const computeRedFlags = (ideaText: string, taxonomy: TaxonomyType, dice: DiceScores): RedFlagResult[] => {
  const text = ideaText.toLowerCase();
  return [
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
};

const computeFrameworks = (
  taxonomy: TaxonomyResult,
  dice: DiceScores,
  reliability: ReliabilityResult,
  route: RouteRecommendation,
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

const buildRejectedResult = (title: string, ideaText: string, legitimacy: LegitimacyResult): GatingEvaluationResult => ({
  schemaVersion: SCHEMA_VERSION,
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
    'The legitimacy gate runs before framework agents to avoid wasting workflow cost.',
    'Unsafe, spam, and prompt-injection submissions should be hidden from public history.',
    'Public history should show only safe or redacted rejected submissions.',
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
  simulated: true,
});

export const simulateAiGateEvaluation = (title: string, ideaText: string): GatingEvaluationResult => {
  const legitimacy = assessLegitimacy(title, ideaText);
  if (!legitimacy.isLegitimate) return buildRejectedResult(title, ideaText, legitimacy);

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
      summary: 'Accepted as a product or workflow idea.',
      output: legitimacy as unknown as Record<string, unknown>,
    },
    {
      key: 'taxonomy',
      agentName: 'Problem Taxonomy Agent',
      status: 'completed',
      summary: `${taxonomy.type}: ${taxonomy.title}.`,
      output: taxonomy as unknown as Record<string, unknown>,
    },
    {
      key: 'dice',
      agentName: 'DICE Agent',
      status: 'completed',
      summary: `DICE total ${dice.total}/20 with RAV ${dice.rav}.`,
      output: dice as unknown as Record<string, unknown>,
    },
    {
      key: 'reliability',
      agentName: 'Reliability-Stakes Agent',
      status: 'completed',
      summary: reliability.quadrant,
      output: reliability as unknown as Record<string, unknown>,
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
      output: route as unknown as Record<string, unknown>,
    },
  ];

  const summary = `This idea maps to ${taxonomy.title.toLowerCase()} and should ${route.decisionLabel === 'REJECT' ? 'not ' : ''}be built around an LLM-first decision path.`;
  const buildRecommendation =
    route.decisionLabel === 'REJECT'
      ? 'Keep AI out of the core decision path. If desired, use AI only for paraphrasing or user-facing explanations.'
      : route.decisionLabel === 'DEFER'
        ? 'The use case is interesting, but governance and unit economics are not yet strong enough for a production-grade AI rollout.'
        : `Proceed with ${route.automationLevel.toLowerCase()} and keep the harness deterministic around the model.`;

  const conclusion =
    route.decisionLabel === 'REJECT'
      ? 'This is a classic case where AI would add variance and cost without improving the underlying product outcome.'
      : route.decisionLabel === 'DEFER'
        ? 'There is promise here, but the right next step is a tightly scoped pilot with explicit kill criteria.'
        : `The right build is not "AI everywhere"; it is ${route.solver.toLowerCase()} with carefully chosen autonomy boundaries.`;

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
    buildRecommendation,
    conclusion,
    governanceNotes: [
      'Keep the control flow deterministic; let the model handle reasoning, not state management.',
      'Define an eval set before broad rollout so the gate is evidence-based rather than intuitive.',
      'Instrument human override, fallback rates, public-history redaction, and error categories from day one.',
    ],
    agentOutputs,
    simulated: true,
  };
};

const normalizeFunctionPayload = (payload: any): any => {
  if (Array.isArray(payload)) return normalizeFunctionPayload(payload[0]);
  if (payload?.body) return normalizeFunctionPayload(payload.body);
  if (payload?.data) return normalizeFunctionPayload(payload.data);
  return payload;
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
) => {
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

const buildCoverageManifest = (result: GatingEvaluationResult): CoverageManifest => ({
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
    workflowExecutionId: result.workflowExecutionId || (result.simulated ? 'fallback-not-required' : null),
  }),
});

const replaceSensitiveIdeaText = <T,>(value: T, sensitiveIdeaText: string, publicIdeaText: string): T => {
  if (!sensitiveIdeaText || sensitiveIdeaText === publicIdeaText) return value;
  if (typeof value === 'string') return value.split(sensitiveIdeaText).join(publicIdeaText) as T;
  if (Array.isArray(value)) {
    return value.map((item) => replaceSensitiveIdeaText(item, sensitiveIdeaText, publicIdeaText)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        replaceSensitiveIdeaText(entry, sensitiveIdeaText, publicIdeaText),
      ])
    ) as T;
  }
  return value;
};

export const normalizeAiGateResult = (result: any): GatingEvaluationResult => {
  const base = result || {};
  const fallback = simulateAiGateEvaluation(String(base.title || 'Custom Idea'), String(base.ideaText || base.idea_text || 'A product workflow idea that should be evaluated for AI suitability.'));
  const normalized = {
    ...fallback,
    ...base,
    schemaVersion: base.schemaVersion || base.schema_version || fallback.schemaVersion,
    workflowExecutionId: base.workflowExecutionId || base.workflow_execution_id || null,
    legitimacy: base.legitimacy || fallback.legitimacy,
    taxonomy: {
      ...fallback.taxonomy,
      ...(base.taxonomy || {}),
    },
    dice: {
      ...fallback.dice,
      ...(base.dice || {}),
      dimensions: Array.isArray(base.dice?.dimensions)
        ? base.dice.dimensions
        : buildDiceDimensions(
            {
              determinism: Number(base.dice?.determinism ?? fallback.dice.determinism),
              inputComplexity: Number(base.dice?.inputComplexity ?? fallback.dice.inputComplexity),
              costOfError: Number(base.dice?.costOfError ?? fallback.dice.costOfError),
              economics: Number(base.dice?.economics ?? fallback.dice.economics),
            },
            base.dice?.rationale || fallback.dice.rationale
          ),
    },
    reliability: {
      ...fallback.reliability,
      ...(base.reliability || {}),
      quadrantReasoning:
        base.reliability?.quadrantReasoning ||
        base.reliability?.quadrant_reasoning ||
        fallback.reliability.quadrantReasoning,
      axisMeanings:
        base.reliability?.axisMeanings ||
        base.reliability?.axis_meanings ||
        fallback.reliability.axisMeanings,
    },
    redFlags: Array.isArray(base.redFlags) ? base.redFlags : Array.isArray(base.red_flags) ? base.red_flags : fallback.redFlags,
    frameworks: Array.isArray(base.frameworks) ? base.frameworks : fallback.frameworks,
    route: {
      ...fallback.route,
      ...(base.route || {}),
    },
    governanceNotes: Array.isArray(base.governanceNotes) ? base.governanceNotes : fallback.governanceNotes,
    agentOutputs: normalizeAgentOutputs(base.agentOutputs || base.agent_outputs || fallback.agentOutputs),
  };
  return {
    ...normalized,
    coverageManifest: base.coverageManifest || base.coverage_manifest || buildCoverageManifest(normalized),
  };
};

export const evaluateIdeaWithAiGate = async (params: {
  title: string;
  ideaText: string;
  source: 'preset' | 'custom';
  presetId?: string;
  clientMetadata?: Record<string, unknown>;
}): Promise<GatingEvaluationResponse> => {
  try {
    const { data, error } = await supabase.functions.invoke(AI_GATE_FUNCTION, {
      body: {
        title: params.title,
        idea_text: params.ideaText,
        source: params.source,
        preset_id: params.presetId ?? null,
        user_session_id: getAnonymousSessionId(),
        client_metadata: {
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          ...(params.clientMetadata ?? {}),
        },
      },
    });

    if (error) throw error;

    const normalized = normalizeFunctionPayload(data);
    if (normalized?.result && normalized?.assessmentId && normalized?.ideaId) {
      const result = normalizeAiGateResult(normalized.result);
      return {
        ...normalized,
        result,
        legitimacy: normalized.legitimacy || result.legitimacy,
        agentOutputs: normalizeAgentOutputs(normalized.agentOutputs || result.agentOutputs),
      } as GatingEvaluationResponse;
    }
    throw new Error('Unexpected response format from AI gate function.');
  } catch {
    const fallback = simulateAiGateEvaluation(params.title, params.ideaText);
    const now = new Date().toISOString();
    return {
      ideaId: `preview-${Date.now()}`,
      assessmentId: `preview-${Date.now() + 1}`,
      status: fallback.legitimacy?.isLegitimate === false ? 'rejected' : 'preview',
      resultSource: fallback.legitimacy?.isLegitimate === false ? 'decider' : 'fallback',
      schemaVersion: SCHEMA_VERSION,
      workflowExecutionId: null,
      createdAt: now,
      completedAt: now,
      durationMs: 0,
      legitimacy: fallback.legitimacy,
      agentOutputs: fallback.agentOutputs,
      result: fallback,
    };
  }
};

const mapHistoryRow = (row: any): GatingEvaluationHistoryItem => {
  const idea = row.idea || row.ai_gate_ideas || {};
  const resultPayload = row.result_payload || null;
  const rawResultIdeaText = String(resultPayload?.ideaText || resultPayload?.idea_text || '');
  const result = resultPayload ? normalizeAiGateResult(resultPayload) : null;
  const legitimacy = row.legitimacy_payload && Object.keys(row.legitimacy_payload).length
    ? row.legitimacy_payload as LegitimacyResult
    : result?.legitimacy;
  const title = idea.display_title || legitimacy?.generatedTitle || result?.title || idea.title || 'Untitled idea';
  const ideaText = idea.public_idea_text || legitimacy?.redactedIdeaText || result?.ideaText || idea.idea_text || '';
  const diceTotal = result?.dice?.total ?? null;
  const safeResult = result
    ? replaceSensitiveIdeaText(
        {
          ...result,
          ideaText,
        },
        rawResultIdeaText || result.ideaText,
        ideaText
      )
    : null;
  const safeAgentOutputs = normalizeAgentOutputs(
    replaceSensitiveIdeaText(row.agent_outputs || result?.agentOutputs, rawResultIdeaText || result?.ideaText || '', ideaText)
  );

  return {
    ideaId: String(row.idea_id || idea.id || ''),
    assessmentId: String(row.id),
    title,
    ideaText,
    source: String(idea.source || 'custom'),
    presetId: idea.preset_id ?? null,
    status: row.status,
    decisionLabel: row.decision_label,
    taxonomyType: idea.taxonomy_type || result?.taxonomy?.type || null,
    recommendedSolver: row.recommended_solver || result?.route?.solver || null,
    automationLevel: row.automation_level || result?.route?.automationLevel || null,
    diceTotal,
    resultSource: row.result_source as ResultSource,
    publicVisibility: idea.public_visibility,
    createdAt: row.created_at || idea.created_at,
    completedAt: row.completed_at || row.updated_at || null,
    durationMs: row.duration_ms ?? null,
    legitimacy,
    agentOutputs: safeAgentOutputs,
    result: safeResult,
  };
};

const visibleHistory = (data: any[] | null | undefined) =>
  (data || [])
    .map(mapHistoryRow)
    .filter((item) => item.publicVisibility !== 'hide')
    .filter((item) => ['completed', 'rejected', 'preview'].includes(String(item.status)));

export const listAiGateHistory = async (limit = 30): Promise<GatingEvaluationHistoryItem[]> => {
  const { data, error } = await supabase
    .from('ai_gate_assessments')
    .select(`
      id,
      idea_id,
      status,
      decision_label,
      recommended_solver,
      automation_level,
      result_payload,
      legitimacy_payload,
      agent_outputs,
      result_source,
      created_at,
      updated_at,
      completed_at,
      duration_ms,
      idea:ai_gate_ideas (
        id,
        title,
        display_title,
        idea_text,
        public_idea_text,
        source,
        preset_id,
        taxonomy_type,
        legitimacy_status,
        public_visibility,
        created_at,
        updated_at
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!error) return visibleHistory(data);

  const missingV2Column =
    error.message?.includes('schema cache') ||
    error.message?.includes('does not exist') ||
    error.message?.includes('Could not find') ||
    error.message?.includes('relationship');

  if (!missingV2Column) throw error;

  const fallback = await supabase
    .from('ai_gate_assessments')
    .select(`
      id,
      idea_id,
      status,
      decision_label,
      recommended_solver,
      automation_level,
      framework_scores,
      result_payload,
      created_at,
      updated_at,
      idea:ai_gate_ideas (
        id,
        title,
        idea_text,
        source,
        preset_id,
        taxonomy_type,
        created_at,
        updated_at
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (fallback.error) throw fallback.error;
  return visibleHistory(fallback.data);
};
