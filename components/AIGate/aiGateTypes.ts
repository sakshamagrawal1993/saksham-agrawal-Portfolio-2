export type GatingDecisionLabel =
  | 'REJECT'
  | 'DEFER'
  | 'APPROVE (Assistive)'
  | 'APPROVE (Constrained Autonomy)'
  | 'APPROVE (Autonomous)';

export type AutomationLevel =
  | 'Deterministic only'
  | 'Classical ML first'
  | 'Assistive AI'
  | 'Constrained autonomy'
  | 'Autonomous agent';

export type TaxonomyType = 'Type I' | 'Type II' | 'Type III' | 'Type IV';

export type GatingAssessmentStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'rejected'
  | 'failed'
  | 'preview';

export type ResultSource = 'n8n' | 'fallback' | 'decider';

export type PublicVisibility = 'show' | 'show_redacted' | 'hide';

export type LegitimacyStatus =
  | 'accepted'
  | 'needs_more_detail'
  | 'rejected_spam'
  | 'rejected_unsafe'
  | 'rejected_prompt_injection'
  | 'rejected_sensitive_data'
  | 'rejected_not_an_idea';

export interface IdeaPreset {
  id: string;
  title: string;
  subtitle: string;
  ideaText: string;
  hint: string;
}

export type DiceDimensionKey = 'determinism' | 'inputComplexity' | 'costOfError' | 'economics';

export interface DiceDimension {
  key: DiceDimensionKey;
  label: string;
  score: number;
  scoreMeaning: string;
  reasoning: string;
}

export interface LegitimacyResult {
  isLegitimate: boolean;
  status: LegitimacyStatus;
  confidence: number;
  category: string;
  publicVisibility: PublicVisibility;
  redactedIdeaText: string;
  generatedTitle: string;
  rejectionReason: string | null;
  improvementPrompt: string | null;
  flags: string[];
}

export interface DiceScores {
  determinism: number;
  inputComplexity: number;
  costOfError: number;
  economics: number;
  total: number;
  rav?: number;
  rationale?: Partial<Record<'determinism' | 'inputComplexity' | 'costOfError' | 'economics', string>>;
  dimensions?: DiceDimension[];
}

export interface FrameworkScore {
  key: string;
  label: string;
  score: number;
  summary: string;
}

export interface TaxonomyResult {
  type: TaxonomyType;
  title: string;
  reasoning: string;
  inputStructure?: string;
  solutionSpecifiability?: string;
  decompositionNotes?: string;
}

export interface ReliabilityResult {
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
}

export interface RedFlagResult {
  key: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  triggered: boolean;
  explanation: string;
  mitigation: string;
}

export interface RouteRecommendation {
  solver: string;
  decisionLabel: GatingDecisionLabel;
  automationLevel: AutomationLevel;
  reasoning: string;
}

export interface AgentOutput {
  key: string;
  agentName: string;
  status: 'completed' | 'rejected' | 'failed' | 'skipped';
  summary: string;
  output: Record<string, unknown>;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
}

export interface GatingEvaluationResult {
  schemaVersion?: string;
  workflowExecutionId?: string | null;
  title: string;
  ideaText: string;
  summary: string;
  legitimacy?: LegitimacyResult;
  taxonomy: TaxonomyResult;
  dice: DiceScores;
  reliability: ReliabilityResult;
  redFlags?: RedFlagResult[];
  frameworks: FrameworkScore[];
  route: RouteRecommendation;
  conclusion: string;
  buildRecommendation: string;
  governanceNotes: string[];
  agentOutputs?: AgentOutput[];
  simulated?: boolean;
}

export interface GatingEvaluationResponse {
  ideaId: string;
  assessmentId: string;
  status: GatingAssessmentStatus | string;
  resultSource?: ResultSource;
  schemaVersion?: string;
  workflowExecutionId?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  durationMs?: number | null;
  legitimacy?: LegitimacyResult;
  agentOutputs?: AgentOutput[];
  result: GatingEvaluationResult;
}

export interface GatingEvaluationHistoryItem {
  ideaId: string;
  assessmentId: string;
  title: string;
  ideaText: string;
  source: string;
  presetId?: string | null;
  status: GatingAssessmentStatus | string;
  decisionLabel?: GatingDecisionLabel | null;
  taxonomyType?: TaxonomyType | string | null;
  recommendedSolver?: string | null;
  automationLevel?: AutomationLevel | string | null;
  diceTotal?: number | null;
  resultSource?: ResultSource;
  publicVisibility?: PublicVisibility;
  createdAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  legitimacy?: LegitimacyResult;
  agentOutputs?: AgentOutput[];
  result?: GatingEvaluationResult | null;
}
