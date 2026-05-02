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

export interface IdeaPreset {
  id: string;
  title: string;
  subtitle: string;
  ideaText: string;
  hint: string;
}

export interface DiceScores {
  determinism: number;
  inputComplexity: number;
  costOfError: number;
  economics: number;
  total: number;
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
}

export interface ReliabilityResult {
  requirement: number;
  stakes: number;
  quadrant: string;
  strategy: string;
}

export interface RouteRecommendation {
  solver: string;
  decisionLabel: GatingDecisionLabel;
  automationLevel: AutomationLevel;
  reasoning: string;
}

export interface GatingEvaluationResult {
  title: string;
  ideaText: string;
  summary: string;
  taxonomy: TaxonomyResult;
  dice: DiceScores;
  reliability: ReliabilityResult;
  frameworks: FrameworkScore[];
  route: RouteRecommendation;
  conclusion: string;
  buildRecommendation: string;
  governanceNotes: string[];
  simulated?: boolean;
}

export interface GatingEvaluationResponse {
  ideaId: string;
  assessmentId: string;
  status: string;
  result: GatingEvaluationResult;
}
