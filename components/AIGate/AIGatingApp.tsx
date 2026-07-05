import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  Filter,
  History,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Send,
  Workflow,
  XCircle,
} from 'lucide-react';
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import {
  AI_GATE_MAX_IDEA_LENGTH,
  AI_GATE_MIN_IDEA_LENGTH,
  DICE_SCORE_MEANINGS,
  IDEA_PRESETS,
  evaluateIdeaWithAiGate,
  listAiGateHistory,
} from './aiGateApi';
import type {
  AgentOutput,
  AutomationLevel,
  DiceDimension,
  DiceDimensionKey,
  FrameworkScore,
  GatingEvaluationResult,
  GatingDecisionLabel,
  GatingEvaluationHistoryItem,
  GatingEvaluationResponse,
  IdeaPreset,
  ResultSource,
} from './aiGateTypes';

interface AIGatingAppProps {
  onBack: () => void;
}

const decisionStyles: Record<GatingDecisionLabel, string> = {
  REJECT: 'bg-[#C75B5B]/10 text-[#A54B4B] border-[#C75B5B]/20',
  DEFER: 'bg-[#D4A574]/12 text-[#8B6231] border-[#D4A574]/25',
  'APPROVE (Assistive)': 'bg-[#6B8F71]/10 text-[#4D7253] border-[#6B8F71]/20',
  'APPROVE (Constrained Autonomy)': 'bg-[#7396C8]/10 text-[#426A96] border-[#7396C8]/20',
  'APPROVE (Autonomous)': 'bg-[#2C2A26] text-[#F5F2EB] border-[#2C2A26]',
};

const sourceStyles: Record<ResultSource, string> = {
  n8n: 'border-[#6B8F71]/25 bg-[#6B8F71]/10 text-[#4D7253]',
  fallback: 'border-[#D4A574]/30 bg-[#D4A574]/12 text-[#8B6231]',
  decider: 'border-[#C75B5B]/25 bg-[#C75B5B]/10 text-[#A54B4B]',
};

const automationSteps: AutomationLevel[] = [
  'Deterministic only',
  'Classical ML first',
  'Assistive AI',
  'Constrained autonomy',
  'Autonomous agent',
];

const frameworkColors = ['#2C2A26', '#6B8F71', '#D4A574', '#7396C8', '#C75B5B'];

const ideaRows = [
  IDEA_PRESETS.slice(0, 5),
  IDEA_PRESETS.slice(5, 10),
  IDEA_PRESETS.slice(10, 15),
];

type ClarifierRole = 'agent' | 'user';

interface ClarifierMessage {
  role: ClarifierRole;
  content: string;
}

const initialClarifierMessages: ClarifierMessage[] = [
  {
    role: 'agent',
    content: 'I will shape the idea before the gate. Start with the user, input, decision, output, and what can go wrong.',
  },
];

const concreteChecks = [
  {
    key: 'user',
    label: 'User',
    question: 'Who is the primary user or team, and when would they use this workflow?',
    keywords: ['user', 'customer', 'agent', 'team', 'analyst', 'manager', 'clinician', 'sales', 'support', 'employee', 'staff'],
  },
  {
    key: 'input',
    label: 'Input',
    question: 'What inputs, documents, systems, or data fields does the workflow receive?',
    keywords: ['input', 'email', 'pdf', 'document', 'crm', 'ticket', 'database', 'field', 'form', 'notes', 'history', 'logs', 'policy'],
  },
  {
    key: 'decision',
    label: 'Decision',
    question: 'What decision, recommendation, classification, or action should the system produce?',
    keywords: ['decide', 'decision', 'classify', 'score', 'recommend', 'route', 'draft', 'summarize', 'flag', 'approve', 'detect', 'extract'],
  },
  {
    key: 'stakes',
    label: 'Stakes',
    question: 'What is the cost of a wrong result, and should a human approve anything before it affects users?',
    keywords: ['risk', 'wrong', 'error', 'human', 'review', 'approve', 'compliance', 'legal', 'medical', 'financial', 'rollback', 'audit'],
  },
  {
    key: 'economics',
    label: 'Value',
    question: 'What volume, frequency, or business value makes this worth automating?',
    keywords: ['volume', 'daily', 'weekly', 'scale', 'cost', 'time', 'manual', 'hours', 'savings', 'revenue', 'value', 'frequency'],
  },
] as const;

const userClarifierAnswers = (messages: ClarifierMessage[]) =>
  messages.filter((message) => message.role === 'user').map((message) => message.content.trim()).filter(Boolean);

const buildClarifiedIdea = (idea: string, messages: ClarifierMessage[]) => {
  const answers = userClarifierAnswers(messages);
  if (!answers.length) return idea.trim();
  return `${idea.trim()}\n\nClarifying context:\n${answers.map((answer, index) => `- ${index + 1}. ${answer}`).join('\n')}`.trim();
};

const getMissingConcreteChecks = (idea: string, messages: ClarifierMessage[]) => {
  const combined = `${idea} ${userClarifierAnswers(messages).join(' ')}`.toLowerCase();
  return concreteChecks.filter((check) => !check.keywords.some((keyword) => combined.includes(keyword)));
};

const isConcreteEnough = (idea: string, messages: ClarifierMessage[]) => {
  const clarifiedIdea = buildClarifiedIdea(idea, messages);
  return clarifiedIdea.length >= AI_GATE_MIN_IDEA_LENGTH && getMissingConcreteChecks(idea, messages).length <= 1;
};

const quadrantCards = [
  {
    key: 'High Reliability + Low Stakes',
    title: 'Sweet Spot',
    body: 'Autonomous AI is viable when misses are recoverable and value compounds with scale.',
  },
  {
    key: 'High Reliability + High Stakes',
    title: 'Danger Zone',
    body: 'Use validators, experts, and rollback controls when the answer needs to be right and the cost of being wrong is high.',
  },
  {
    key: 'Low Reliability + Low Stakes',
    title: 'Playground',
    body: 'User-driven AI and experimentation work well when the downside is light.',
  },
  {
    key: 'Low Reliability + High Stakes',
    title: 'Prohibited Zone',
    body: 'This is where AI should not act autonomously. Redesign the workflow instead.',
  },
];

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const formatDuration = (durationMs?: number | null) => {
  if (!durationMs && durationMs !== 0) return 'Not recorded';
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${Math.round(durationMs / 100) / 10}s`;
};

const resultSourceLabel = (source?: ResultSource) => {
  if (source === 'n8n') return 'Live n8n';
  if (source === 'decider') return 'Decider';
  return 'Preview fallback';
};

type HistorySourceFilter = 'all' | ResultSource;

const historyDecisionFilterLabel = (filter: 'all' | GatingDecisionLabel | 'rejected') =>
  filter === 'all' ? 'all decisions' : filter === 'rejected' ? 'rejected gates' : filter;

const historySourceFilterLabel = (filter: HistorySourceFilter) =>
  filter === 'all' ? 'all sources' : resultSourceLabel(filter);

const getMissingCoverageSections = (result: GatingEvaluationResult) =>
  Object.entries(result.coverageManifest ?? {})
    .filter(([, item]) => !item.present)
    .map(([key, item]) => `${key}${item.missingFields.length ? `: ${item.missingFields.join(', ')}` : ''}`);

const ResultBadge = ({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'highlight';
}) => (
  <div className={`rounded-2xl border px-4 py-3 ${tone === 'highlight' ? 'border-[#2C2A26] bg-[#2C2A26] text-[#F5F2EB]' : 'border-[#D8D2C6] bg-[#FAF8F3] text-[#2C2A26]'}`}>
    <div className={`text-[10px] uppercase tracking-[0.2em] ${tone === 'highlight' ? 'text-[#F5F2EB]/60' : 'text-[#2C2A26]/45'}`}>{label}</div>
    <div className="mt-1 text-sm font-semibold">{value}</div>
  </div>
);

const simplerBaselineByLevel: Record<AutomationLevel, string> = {
  'Deterministic only': 'Start with the recorded taxonomy and rule boundaries before adding model judgment.',
  'Classical ML first': 'Try a deterministic rules pass or labeled classifier before introducing generative output.',
  'Assistive AI': 'Pilot this as a human-reviewed drafting or recommendation aid before letting it act.',
  'Constrained autonomy': 'Prove the assistive workflow first, then constrain any autonomous step behind approvals.',
  'Autonomous agent': 'Run a constrained-autonomy pilot first, with approval gates around irreversible actions.',
};

const getSmallestViableSolverPanel = (
  result: GatingEvaluationResult,
  status: string,
  source: ResultSource
) => {
  const isStopped = status === 'rejected' || source === 'decider' || result.legitimacy?.isLegitimate === false;

  if (isStopped) {
    return {
      isStopped: true,
      items: [
        {
          label: 'Solver recommendation',
          value: 'No solver recommendation for stopped assessments.',
        },
        {
          label: 'Next safe step',
          value: result.legitimacy?.improvementPrompt || result.legitimacy?.rejectionReason || 'Revise the idea brief and run the gate again.',
        },
      ],
    };
  }

  const guardrails = [
    result.reliability.humanReviewRequirement,
    ...(result.redFlags?.filter((flag) => flag.triggered).map((flag) => flag.mitigation) ?? []),
    ...result.governanceNotes,
    result.reliability.strategy,
  ].filter(Boolean);

  return {
    isStopped: false,
    items: [
      {
        label: 'Recommended solver',
        value: result.route.solver,
      },
      {
        label: 'Simpler baseline to try first',
        value: simplerBaselineByLevel[result.route.automationLevel],
      },
      {
        label: 'Why not increase autonomy yet',
        value: result.reliability.humanReviewRequirement || result.reliability.quadrantReasoning || result.route.reasoning,
      },
      {
        label: 'Minimum guardrails',
        value: guardrails.slice(0, 2).join(' ') || result.reliability.strategy,
      },
    ],
  };
};

const SmallestViableSolverPanel = ({
  result,
  status,
  source,
}: {
  result: GatingEvaluationResult;
  status: string;
  source: ResultSource;
}) => {
  const panel = getSmallestViableSolverPanel(result, status, source);

  return (
    <div className="rounded-[32px] border border-[#D8D2C6] bg-white p-6 shadow-[0_16px_50px_rgba(44,42,38,0.04)]">
      <div className="flex items-start gap-3">
        <div className={`rounded-2xl p-3 ${panel.isStopped ? 'bg-[#C75B5B]/10' : 'bg-[#6B8F71]/10'}`}>
          {panel.isStopped ? <ShieldAlert className="h-5 w-5 text-[#A54B4B]" /> : <ShieldCheck className="h-5 w-5 text-[#4D7253]" />}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Smallest Viable Solver</div>
          <h3 className="mt-1 text-xl font-semibold">
            {panel.isStopped ? 'No solver until the idea passes the decider' : 'Smallest useful path before more autonomy'}
          </h3>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {panel.items.map((item) => (
          <div key={item.label} className="rounded-[22px] border border-[#D8D2C6] bg-[#FAF8F3] p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#2C2A26]/45">{item.label}</div>
            <p className="mt-2 text-sm leading-6 text-[#2C2A26]">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const FrameworkCard = ({ framework, index }: { framework: FrameworkScore; index: number }) => (
  <div className="rounded-[24px] border border-[#D8D2C6] bg-white p-5 shadow-[0_10px_30px_rgba(44,42,38,0.04)]">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Framework</div>
        <h3 className="mt-1 text-base font-semibold text-[#2C2A26]">{framework.label}</h3>
      </div>
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-semibold text-white"
        style={{ backgroundColor: frameworkColors[index % frameworkColors.length] }}
      >
        {framework.score}
      </div>
    </div>
    <p className="mt-4 text-sm leading-6 text-[#5D5A53]">{framework.summary}</p>
  </div>
);

const IdeaPillRow = ({
  ideas,
  direction = 'left',
  duration = 42,
  onSelect,
  selectedId,
}: {
  ideas: IdeaPreset[];
  direction?: 'left' | 'right';
  duration?: number;
  onSelect: (idea: IdeaPreset) => void;
  selectedId: string | null;
}) => (
  <div className="ai-gate-pill-row relative overflow-hidden py-1 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
    <div
      className={`flex w-max gap-3 ${direction === 'right' ? 'ai-gate-marquee-reverse' : 'ai-gate-marquee'}`}
      style={{ '--marquee-duration': `${duration}s` } as React.CSSProperties}
    >
      {[...ideas, ...ideas].map((idea, index) => {
        const isActive = idea.id === selectedId;
        return (
          <button
            key={`${idea.id}-${index}`}
            type="button"
            onClick={() => onSelect(idea)}
            className={`shrink-0 rounded-full border px-5 py-3 text-sm font-medium shadow-sm transition ${
              isActive
                ? 'border-[#2C2A26] bg-[#2C2A26] text-[#F5F2EB]'
                : 'border-[#D8D2C6] bg-white/90 text-[#2C2A26] hover:border-[#2C2A26]/35 hover:bg-white'
            }`}
            title={idea.hint}
          >
            {idea.title}
          </button>
        );
      })}
    </div>
  </div>
);

const DiceDimensionCard = ({ dimension }: { dimension: DiceDimension }) => (
  <div className="rounded-[24px] border border-[#D8D2C6] bg-[#FAF8F3] p-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">{dimension.key}</div>
        <h4 className="mt-1 text-base font-semibold text-[#2C2A26]">{dimension.label}</h4>
      </div>
      <div className="rounded-2xl bg-[#2C2A26] px-3 py-2 text-sm font-semibold text-[#F5F2EB]">{dimension.score}/5</div>
    </div>
    <p className="mt-4 text-sm font-medium leading-6 text-[#2C2A26]">{dimension.scoreMeaning}</p>
    <p className="mt-2 text-sm leading-6 text-[#5D5A53]">{dimension.reasoning}</p>
  </div>
);

const DiceRubric = ({ dimension }: { dimension: DiceDimension }) => {
  const meanings = DICE_SCORE_MEANINGS[dimension.key as DiceDimensionKey];
  return (
    <details className="rounded-[20px] border border-[#D8D2C6] bg-white px-4 py-3">
      <summary className="cursor-pointer list-none text-sm font-semibold text-[#2C2A26]">{dimension.label} score meanings</summary>
      <div className="mt-3 grid gap-2">
        {([1, 2, 3, 4, 5] as const).map((score) => (
          <div key={score} className={`rounded-2xl px-3 py-2 text-xs leading-5 ${score === dimension.score ? 'bg-[#2C2A26] text-[#F5F2EB]' : 'bg-[#FAF8F3] text-[#5D5A53]'}`}>
            <span className="font-semibold">{score}:</span> {meanings[score]}
          </div>
        ))}
      </div>
    </details>
  );
};

const ReliabilityMatrix = ({
  requirement,
  stakes,
  quadrant,
}: {
  requirement: number;
  stakes: number;
  quadrant: string;
}) => {
  const x = ((Math.max(1, Math.min(5, stakes)) - 1) / 4) * 100;
  const y = (1 - (Math.max(1, Math.min(5, requirement)) - 1) / 4) * 100;

  return (
    <div className="rounded-[28px] border border-[#D8D2C6] bg-[#FAF8F3] p-5">
      <div className="relative mx-auto aspect-[1.16] w-full max-w-[520px] rounded-[24px] border border-[#D8D2C6] bg-white p-4">
        <div className="grid h-full grid-cols-2 grid-rows-2 overflow-hidden rounded-[18px] border border-[#EFE9DE]">
          {quadrantCards.map((card) => {
            const isActive = card.key === quadrant;
            return (
              <div
                key={card.key}
                className={`flex items-center justify-center border border-[#EFE9DE] p-3 text-center text-xs font-semibold leading-5 ${
                  isActive ? 'bg-[#2C2A26] text-[#F5F2EB]' : 'bg-[#FAF8F3] text-[#5D5A53]'
                }`}
              >
                {card.title}
              </div>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-x-4 bottom-4 top-4">
          <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-[#F5F2EB] bg-[#C75B5B] px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(44,42,38,0.2)]"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="h-2 w-2 rounded-full bg-white" />
            {requirement}/5 · {stakes}/5
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#2C2A26]/45">
        <div className="flex justify-between">
          <span>Failure Stakes: low</span>
          <span>high</span>
        </div>
        <div className="flex justify-between">
          <span>Reliability Requirement: high</span>
          <span>low</span>
        </div>
      </div>
    </div>
  );
};

const AgentTraceCard = ({ agent, index }: { agent: AgentOutput; index: number }) => (
  <details className="rounded-[22px] border border-[#D8D2C6] bg-[#FAF8F3] p-4">
    <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Agent {String(index + 1).padStart(2, '0')}</div>
        <h4 className="mt-1 text-sm font-semibold text-[#2C2A26]">{agent.agentName}</h4>
        <p className="mt-2 text-sm leading-6 text-[#5D5A53]">{agent.summary}</p>
      </div>
      <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
        agent.status === 'completed'
          ? 'border-[#6B8F71]/25 bg-[#6B8F71]/10 text-[#4D7253]'
          : agent.status === 'rejected'
            ? 'border-[#C75B5B]/25 bg-[#C75B5B]/10 text-[#A54B4B]'
            : 'border-[#D4A574]/25 bg-[#D4A574]/12 text-[#8B6231]'
      }`}>
        {agent.status}
      </span>
    </summary>
    <pre className="mt-4 max-h-72 overflow-auto rounded-[18px] bg-[#2C2A26] p-4 text-xs leading-5 text-[#F5F2EB]">
      {JSON.stringify(agent.output, null, 2)}
    </pre>
  </details>
);

const AIGatingApp: React.FC<AIGatingAppProps> = ({ onBack }) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [ideaTitle, setIdeaTitle] = useState('Custom Idea');
  const [customIdea, setCustomIdea] = useState('');
  const [activeResult, setActiveResult] = useState<GatingEvaluationResponse | null>(null);
  const [history, setHistory] = useState<GatingEvaluationHistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | GatingDecisionLabel | 'rejected'>('all');
  const [historySourceFilter, setHistorySourceFilter] = useState<HistorySourceFilter>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [clarifierMessages, setClarifierMessages] = useState<ClarifierMessage[]>(initialClarifierMessages);
  const [clarifierDraft, setClarifierDraft] = useState('');

  const selectedPreset = selectedPresetId ? IDEA_PRESETS.find((preset) => preset.id === selectedPresetId) ?? null : null;
  const effectiveIdea = customIdea.trim();
  const effectiveTitle = selectedPreset?.title || ideaTitle;
  const clarifiedIdea = useMemo(() => buildClarifiedIdea(effectiveIdea, clarifierMessages), [effectiveIdea, clarifierMessages]);
  const missingConcreteChecks = useMemo(() => getMissingConcreteChecks(effectiveIdea, clarifierMessages), [effectiveIdea, clarifierMessages]);
  const concreteEnough = isConcreteEnough(effectiveIdea, clarifierMessages);
  const clarifierAnswers = userClarifierAnswers(clarifierMessages);
  const nextClarifierQuestion = missingConcreteChecks[0]?.question ?? null;

  const activeSource = (activeResult?.resultSource ?? (activeResult?.result.simulated ? 'fallback' : 'n8n')) as ResultSource;
  const agentOutputs = activeResult?.agentOutputs?.length
    ? activeResult.agentOutputs
    : activeResult?.result.agentOutputs ?? [];
  const redFlags = activeResult?.result.redFlags ?? [];
  const triggeredRedFlags = redFlags.filter((flag) => flag.triggered);
  const diceDimensions = activeResult?.result.dice.dimensions ?? [];
  const missingCoverageSections = activeResult ? getMissingCoverageSections(activeResult.result) : [];

  const refreshHistory = async () => {
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await listAiGateHistory());
    } catch (err: unknown) {
      setHistoryError(err instanceof Error ? err.message : 'Unable to load public history.');
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    void refreshHistory();
  }, []);

  const filteredHistory = useMemo(() => {
    const byDecision = historyFilter === 'all'
      ? history
      : historyFilter === 'rejected'
        ? history.filter((item) => item.status === 'rejected')
        : history.filter((item) => item.decisionLabel === historyFilter);

    if (historySourceFilter === 'all') return byDecision;
    return byDecision.filter((item) => (item.resultSource || 'fallback') === historySourceFilter);
  }, [history, historyFilter, historySourceFilter]);

  const radarData = useMemo(() => {
    if (!activeResult) return [];
    return (activeResult.result.dice.dimensions ?? []).map((dimension) => ({
      subject: dimension.label.replace('Input Complexity', 'Input').replace('Cost of Error', 'Error'),
      value: dimension.score,
      fullMark: 5,
    }));
  }, [activeResult]);

  const frameworkChartData = useMemo(
    () =>
      activeResult?.result.frameworks.map((framework) => ({
        label: framework.label.replace(' ', '\n'),
        score: framework.score,
      })) ?? [],
    [activeResult]
  );

  const handleEvaluate = async () => {
    if (!effectiveIdea.trim()) {
      setError('Enter an idea or choose one of the suggested flows to continue.');
      return;
    }

    if (clarifiedIdea.length < AI_GATE_MIN_IDEA_LENGTH || !concreteEnough) {
      const prompt = nextClarifierQuestion || 'Add one more concrete detail before the gate runs.';
      setError(`Concretization Agent: ${prompt}`);
      if (clarifierMessages[clarifierMessages.length - 1]?.content !== prompt) {
        setClarifierMessages((current) => [...current, { role: 'agent', content: prompt }]);
      }
      return;
    }

    if (clarifiedIdea.length > AI_GATE_MAX_IDEA_LENGTH) {
      setError(`The clarified brief is ${clarifiedIdea.length - AI_GATE_MAX_IDEA_LENGTH} characters too long.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await evaluateIdeaWithAiGate({
        title: effectiveTitle,
        ideaText: clarifiedIdea,
        source: selectedPreset ? 'preset' : 'custom',
        presetId: selectedPreset?.id,
        clientMetadata: {
          concretization_agent: {
            answer_count: clarifierAnswers.length,
            transcript: clarifierMessages,
            applied_brief: clarifiedIdea !== effectiveIdea,
          },
        },
      });
      setActiveResult(result);
      await refreshHistory();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to evaluate the idea right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectIdea = (preset: IdeaPreset) => {
    setSelectedPresetId(preset.id);
    setIdeaTitle(preset.title);
    setCustomIdea(preset.ideaText);
    setClarifierMessages(initialClarifierMessages);
    setClarifierDraft('');
    setError(null);
  };

  const handleIdeaChange = (value: string) => {
    setSelectedPresetId(null);
    setIdeaTitle('Custom Idea');
    setCustomIdea(value);
    setClarifierMessages(initialClarifierMessages);
    setClarifierDraft('');
  };

  const handleSendClarifierMessage = () => {
    const answer = clarifierDraft.trim();
    if (!answer) return;

    const userMessage: ClarifierMessage = { role: 'user', content: answer };
    const nextMessages = [...clarifierMessages, userMessage];
    const nextMissingChecks = getMissingConcreteChecks(effectiveIdea, nextMessages);
    const agentMessage: ClarifierMessage = nextMissingChecks.length > 1
      ? { role: 'agent', content: nextMissingChecks[0].question }
      : {
          role: 'agent',
          content: 'This is concrete enough for the gate. I will include these answers as clarifying context when you run the assessment.',
        };

    setClarifierMessages([...nextMessages, agentMessage]);
    setClarifierDraft('');
    setError(null);
  };

  const handleSelectHistory = (item: GatingEvaluationHistoryItem) => {
    if (!item.result) return;
    const publicHistoryResult = {
      ...item.result,
      ideaText: item.ideaText,
    };
    setActiveResult({
      ideaId: item.ideaId,
      assessmentId: item.assessmentId,
      status: item.status,
      resultSource: item.resultSource,
      createdAt: item.createdAt,
      completedAt: item.completedAt,
      durationMs: item.durationMs,
      legitimacy: item.legitimacy,
      agentOutputs: item.agentOutputs,
      result: publicHistoryResult,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#F5F2EB] text-[#2C2A26]">
      <header className="sticky top-0 z-20 border-b border-[#D8D2C6] bg-[#F5F2EB]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4 md:px-10">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center justify-center rounded-full p-2 text-[#2C2A26]/60 transition-colors hover:bg-[#2C2A26]/5 hover:text-[#2C2A26]"
              type="button"
              title="Back to Portfolio"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[#2C2A26] p-2.5 shadow-sm">
                <BrainCircuit className="h-5 w-5 text-[#F5F2EB]" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">AI Gating Lab</h1>
                <p className="text-xs font-medium text-[#2C2A26]/55">Phase 0 evaluator powered by taxonomy, DICE, and reliability gates</p>
              </div>
            </div>
          </div>
          <div className="hidden rounded-full border border-[#D8D2C6] bg-white/90 px-4 py-2 text-xs font-medium text-[#2C2A26]/60 md:block">
            Decider / agents / public history
          </div>
        </div>
      </header>

      <style>{`
        @keyframes ai-gate-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes ai-gate-marquee-reverse {
          from { transform: translateX(-50%); }
          to { transform: translateX(0); }
        }
        .ai-gate-marquee {
          animation: ai-gate-marquee var(--marquee-duration, 42s) linear infinite;
        }
        .ai-gate-marquee-reverse {
          animation: ai-gate-marquee-reverse var(--marquee-duration, 42s) linear infinite;
        }
        .ai-gate-pill-row:hover .ai-gate-marquee,
        .ai-gate-pill-row:hover .ai-gate-marquee-reverse {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .ai-gate-marquee,
          .ai-gate-marquee-reverse {
            animation: none;
          }
        }
      `}</style>

      <main className="mx-auto max-w-[1600px] px-6 py-8 md:px-10">
        <section className="overflow-hidden rounded-[36px] border border-[#D8D2C6] bg-[linear-gradient(180deg,#fffdf9_0%,#f7f2ea_100%)] px-4 py-10 shadow-[0_24px_70px_rgba(44,42,38,0.05)] md:px-8 md:py-14">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#2C2A26]/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2C2A26]/70">
              <Sparkles className="h-3.5 w-3.5" />
              Build Decision Demo
            </div>
            <h2 className="mt-5 text-3xl font-serif leading-tight md:text-5xl">Should this idea be built with AI?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[#5D5A53]">
              Enter a product workflow, or pick a rotating prompt. The legitimacy decider runs first, then n8n framework agents return the final assessment.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-4xl rounded-[30px] border border-[#D8D2C6] bg-white/90 p-4 shadow-[0_16px_55px_rgba(44,42,38,0.08)] md:p-5">
            <label className="sr-only" htmlFor="ai-gate-idea">Idea to be built</label>
            <textarea
              id="ai-gate-idea"
              value={customIdea}
              onChange={(event) => handleIdeaChange(event.target.value)}
              maxLength={AI_GATE_MAX_IDEA_LENGTH}
              className="h-32 w-full resize-none rounded-[24px] border border-[#D8D2C6] bg-[#FAF8F3] px-5 py-4 text-base leading-7 text-[#2C2A26] outline-none transition placeholder:text-[#2C2A26]/35 focus:border-[#2C2A26]/35 focus:bg-white"
              placeholder="Type the idea to be built..."
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#5D5A53]">
              <span>{clarifiedIdea.length < AI_GATE_MIN_IDEA_LENGTH ? `${AI_GATE_MIN_IDEA_LENGTH - clarifiedIdea.length} more characters needed` : `${missingConcreteChecks.length} open context checks`}</span>
              <span>{clarifiedIdea.length}/{AI_GATE_MAX_IDEA_LENGTH}</span>
            </div>
            <div className="mt-4 rounded-[24px] border border-[#D8D2C6] bg-[#FAF8F3] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-2xl bg-white p-2">
                    <BrainCircuit className="h-4 w-4 text-[#2C2A26]" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[#2C2A26]/45">Concretization Agent</div>
                    <div className="text-sm font-semibold text-[#2C2A26]">
                      {concreteEnough ? 'Ready for the gate' : nextClarifierQuestion || 'Add context before evaluation'}
                    </div>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  concreteEnough
                    ? 'border-[#6B8F71]/25 bg-[#6B8F71]/10 text-[#4D7253]'
                    : 'border-[#D4A574]/25 bg-[#D4A574]/12 text-[#8B6231]'
                }`}>
                  {concreteEnough ? 'Concrete' : 'Clarify'}
                </span>
              </div>
              <div className="mt-4 max-h-48 space-y-2 overflow-auto pr-1">
                {clarifierMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[88%] rounded-[18px] px-4 py-3 text-sm leading-6 ${
                      message.role === 'user'
                        ? 'bg-[#2C2A26] text-[#F5F2EB]'
                        : 'border border-[#D8D2C6] bg-white text-[#5D5A53]'
                    }`}>
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={clarifierDraft}
                  onChange={(event) => setClarifierDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleSendClarifierMessage();
                    }
                  }}
                  className="min-w-0 flex-1 rounded-full border border-[#D8D2C6] bg-white px-4 py-2.5 text-sm text-[#2C2A26] outline-none transition placeholder:text-[#2C2A26]/35 focus:border-[#2C2A26]/35"
                  placeholder="Answer the agent..."
                />
                <button
                  type="button"
                  onClick={handleSendClarifierMessage}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2C2A26] text-[#F5F2EB] transition hover:bg-[#3C3934]"
                  title="Send answer"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="text-left text-xs leading-5 text-[#5D5A53]">
                Public history may show safe or redacted submissions. Avoid personal, confidential, or sensitive information.
              </div>
              <button
                type="button"
                onClick={handleEvaluate}
                disabled={isSubmitting}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#2C2A26] px-6 py-3 text-sm font-semibold text-[#F5F2EB] transition hover:bg-[#3C3934] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Evaluating
                  </>
                ) : (
                  <>
                    <Workflow className="h-4 w-4" />
                    Run Gate
                  </>
                )}
              </button>
            </div>
            {error && <p className="mt-3 text-left text-sm text-[#A54B4B]">{error}</p>}
          </div>

          <div className="mx-auto mt-8 max-w-6xl space-y-3">
            {ideaRows.map((row, index) => (
              <IdeaPillRow
                key={index}
                ideas={row}
                direction={index === 1 ? 'right' : 'left'}
                duration={index === 1 ? 48 : 42 + index * 4}
                onSelect={handleSelectIdea}
                selectedId={selectedPresetId}
              />
            ))}
          </div>
        </section>

        <section className="mt-8 space-y-6">
          {!activeResult ? (
            <div className="flex min-h-[70vh] flex-col items-center justify-center rounded-[36px] border border-dashed border-[#D8D2C6] bg-white/60 px-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2C2A26]/5">
                <Database className="h-7 w-7 text-[#2C2A26]/40" />
              </div>
              <h2 className="mt-5 text-2xl font-serif">Awaiting an idea</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#5D5A53]">
                Pick a preset or paste your own concept. The result will show the legitimacy gate, taxonomy, DICE graph, automation recommendation, and agent trace.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-[36px] border border-[#D8D2C6] bg-[linear-gradient(135deg,#2C2A26_0%,#4C453D_45%,#6B8F71_100%)] p-8 text-[#F5F2EB] shadow-[0_30px_90px_rgba(44,42,38,0.12)]">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F5F2EB]/72">
                        Assessment {activeResult.assessmentId}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${sourceStyles[activeSource]}`}>
                        {resultSourceLabel(activeSource)}
                      </span>
                    </div>
                    <h2 className="mt-3 text-3xl font-serif leading-tight md:text-4xl">{activeResult.result.title}</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#F5F2EB]/76">{activeResult.result.ideaText}</p>
                    <p className="mt-5 max-w-2xl text-base leading-7 text-[#F5F2EB]/90">{activeResult.result.conclusion}</p>
                    <div className="mt-5 flex flex-wrap gap-3 text-xs text-[#F5F2EB]/72">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatDateTime(activeResult.completedAt || activeResult.createdAt)}
                      </span>
                      <span>{formatDuration(activeResult.durationMs)}</span>
                      <span>{activeResult.result.schemaVersion || activeResult.schemaVersion || 'ai-gate-result-v1'}</span>
                      <span className="inline-flex items-center gap-1.5">
                        {missingCoverageSections.length ? <ShieldAlert className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {missingCoverageSections.length ? `Missing ${missingCoverageSections.length} contract sections` : 'Contract complete'}
                      </span>
                    </div>
                    {missingCoverageSections.length > 0 && (
                      <p className="mt-2 max-w-2xl text-xs leading-5 text-[#F5F2EB]/70">
                        {missingCoverageSections.slice(0, 3).join(' | ')}
                      </p>
                    )}
                  </div>
                  <div className="grid w-full max-w-sm gap-3">
                    <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${decisionStyles[activeResult.result.route.decisionLabel]}`}>
                      {activeResult.result.route.decisionLabel}
                    </div>
                    <ResultBadge label="Recommended Solver" value={activeResult.result.route.solver} />
                    <ResultBadge label="Automation Level" value={activeResult.result.route.automationLevel} tone="highlight" />
                  </div>
                </div>
                {activeSource !== 'n8n' && (
                  <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-[#F5F2EB]/80">
                    {activeSource === 'decider' ? <ShieldAlert className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {activeSource === 'decider'
                      ? 'Stopped by the legitimacy decider before framework agents ran.'
                      : 'Preview mode: using the local fallback because the live workflow was not reachable.'}
                  </div>
                )}
              </div>

              <SmallestViableSolverPanel
                result={activeResult.result}
                status={activeResult.status}
                source={activeSource}
              />

              {activeResult.result.legitimacy && (
                <div className="rounded-[32px] border border-[#D8D2C6] bg-white p-6 shadow-[0_16px_50px_rgba(44,42,38,0.04)]">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-2xl p-3 ${activeResult.result.legitimacy.isLegitimate ? 'bg-[#6B8F71]/10' : 'bg-[#C75B5B]/10'}`}>
                        {activeResult.result.legitimacy.isLegitimate ? <CheckCircle2 className="h-5 w-5 text-[#4D7253]" /> : <XCircle className="h-5 w-5 text-[#A54B4B]" />}
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Legitimacy Decider</div>
                        <h3 className="mt-1 text-xl font-semibold">
                          {activeResult.result.legitimacy.isLegitimate ? 'Accepted for framework evaluation' : 'Stopped before framework evaluation'}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-[#5D5A53]">
                          {activeResult.result.legitimacy.rejectionReason || `Category: ${activeResult.result.legitimacy.category}. Public visibility: ${activeResult.result.legitimacy.publicVisibility}.`}
                        </p>
                        {activeResult.result.legitimacy.improvementPrompt && (
                          <p className="mt-2 text-sm leading-6 text-[#2C2A26]">{activeResult.result.legitimacy.improvementPrompt}</p>
                        )}
                      </div>
                    </div>
                    <ResultBadge label="Confidence" value={`${Math.round(activeResult.result.legitimacy.confidence * 100)}%`} />
                  </div>
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <div className="rounded-[32px] border border-[#D8D2C6] bg-white p-6 shadow-[0_16px_50px_rgba(44,42,38,0.04)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">DICE Framework</div>
                      <h3 className="mt-1 text-xl font-semibold">Quantitative suitability</h3>
                    </div>
                    <div className="rounded-2xl bg-[#F5F2EB] px-4 py-2 text-sm font-semibold text-[#2C2A26]">
                      {activeResult.result.dice.total}/20
                    </div>
                  </div>
                  <div className="mt-6 h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#D8D2C6" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#5D5A53', fontSize: 12 }} />
                        <Radar
                          dataKey="value"
                          stroke="#2C2A26"
                          fill="#6B8F71"
                          fillOpacity={0.38}
                          strokeWidth={2}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {diceDimensions.map((dimension) => (
                      <DiceDimensionCard key={dimension.key} dimension={dimension} />
                    ))}
                  </div>
                  {typeof activeResult.result.dice.rav === 'number' && (
                    <div className="mt-3">
                      <ResultBadge label="Risk-Adjusted Viability" value={`${activeResult.result.dice.rav}`} />
                    </div>
                  )}
                  <div className="mt-5 rounded-[24px] border border-[#D8D2C6] bg-[#FAF8F3] p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Visible Score Rubric</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {diceDimensions.map((dimension) => (
                        <DiceRubric key={dimension.key} dimension={dimension} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-[32px] border border-[#D8D2C6] bg-white p-6 shadow-[0_16px_50px_rgba(44,42,38,0.04)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[#F5F2EB] p-3">
                      <ShieldCheck className="h-5 w-5 text-[#2C2A26]" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Routing Decision</div>
                      <h3 className="mt-1 text-xl font-semibold">{activeResult.result.taxonomy.type} · {activeResult.result.taxonomy.title}</h3>
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-[#5D5A53]">{activeResult.result.taxonomy.reasoning}</p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <ResultBadge label="Input Structure" value={activeResult.result.taxonomy.inputStructure || 'Not recorded'} />
                    <ResultBadge label="Specifiability" value={activeResult.result.taxonomy.solutionSpecifiability || 'Not recorded'} />
                  </div>
                  {activeResult.result.taxonomy.decompositionNotes && (
                    <div className="mt-5 rounded-[24px] bg-[#FAF8F3] p-5">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Decomposition</div>
                      <p className="mt-2 text-sm leading-6 text-[#2C2A26]">{activeResult.result.taxonomy.decompositionNotes}</p>
                    </div>
                  )}
                  <div className="mt-5 rounded-[24px] border border-[#D8D2C6] bg-white p-5">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Why this route</div>
                    <p className="mt-2 text-sm leading-6 text-[#5D5A53]">{activeResult.result.route.reasoning}</p>
                  </div>
                  <div className="mt-5">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Automation Ladder</div>
                    <div className="mt-3 space-y-2">
                      {automationSteps.map((step, index) => {
                        const isActive = step === activeResult.result.route.automationLevel;
                        return (
                          <div
                            key={step}
                            className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                              isActive ? 'border-[#2C2A26] bg-[#2C2A26] text-[#F5F2EB]' : 'border-[#D8D2C6] bg-[#FAF8F3] text-[#5D5A53]'
                            }`}
                          >
                            <span className="text-sm font-medium">{step}</span>
                            <span className={`text-xs ${isActive ? 'text-[#F5F2EB]/65' : 'text-[#2C2A26]/35'}`}>0{index + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-[32px] border border-[#D8D2C6] bg-white p-6 shadow-[0_16px_50px_rgba(44,42,38,0.04)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[#F5F2EB] p-3">
                      <BarChart3 className="h-5 w-5 text-[#2C2A26]" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Framework Scores</div>
                      <h3 className="mt-1 text-xl font-semibold">How the idea performs across gates</h3>
                    </div>
                  </div>
                  <div className="mt-6 h-[320px]">
                    {frameworkChartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={frameworkChartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                          <CartesianGrid stroke="#EFE9DE" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: '#5D5A53', fontSize: 11 }} interval={0} angle={0} height={50} />
                          <YAxis tick={{ fill: '#5D5A53', fontSize: 12 }} domain={[0, 100]} />
                          <Tooltip cursor={{ fill: '#F5F2EB' }} />
                          <Bar dataKey="score" radius={[12, 12, 0, 0]}>
                            {frameworkChartData.map((entry, index) => (
                              <Cell key={`${entry.label}-${index}`} fill={frameworkColors[index % frameworkColors.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-[24px] bg-[#FAF8F3] text-sm text-[#5D5A53]">
                        Framework agents did not run for this assessment.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[32px] border border-[#D8D2C6] bg-white p-6 shadow-[0_16px_50px_rgba(44,42,38,0.04)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[#F5F2EB] p-3">
                      <Workflow className="h-5 w-5 text-[#2C2A26]" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Reliability vs Stakes</div>
                      <h3 className="mt-1 text-xl font-semibold">{activeResult.result.reliability.quadrant}</h3>
                    </div>
                  </div>
                  <div className="mt-5">
                    <ReliabilityMatrix
                      requirement={activeResult.result.reliability.requirement}
                      stakes={activeResult.result.reliability.stakes}
                      quadrant={activeResult.result.reliability.quadrant}
                    />
                  </div>
                  <div className="mt-5 rounded-[24px] border border-[#D8D2C6] bg-[#FAF8F3] p-5">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Quadrant Reasoning</div>
                    <p className="mt-2 text-sm leading-6 text-[#5D5A53]">
                      {activeResult.result.reliability.quadrantReasoning || `Reliability need is ${activeResult.result.reliability.requirement}/5 and failure stakes are ${activeResult.result.reliability.stakes}/5.`}
                    </p>
                    <p className="mt-3 text-sm font-medium leading-6 text-[#2C2A26]">{activeResult.result.reliability.strategy}</p>
                    {activeResult.result.reliability.humanReviewRequirement && (
                      <p className="mt-2 text-sm leading-6 text-[#5D5A53]">{activeResult.result.reliability.humanReviewRequirement}</p>
                    )}
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[22px] border border-[#D8D2C6] bg-white p-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Reliability Axis</div>
                      <p className="mt-2 text-sm leading-6 text-[#5D5A53]">{activeResult.result.reliability.axisMeanings?.requirement || 'Reliability requirement describes how consistently correct the AI output must be.'}</p>
                    </div>
                    <div className="rounded-[22px] border border-[#D8D2C6] bg-white p-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Stakes Axis</div>
                      <p className="mt-2 text-sm leading-6 text-[#5D5A53]">{activeResult.result.reliability.axisMeanings?.stakes || 'Failure stakes describe the cost and reversibility of a wrong answer.'}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <ResultBadge label="Reliability Need" value={`${activeResult.result.reliability.requirement}/5`} />
                    <ResultBadge label="Failure Stakes" value={`${activeResult.result.reliability.stakes}/5`} />
                  </div>
                </div>
              </div>

              {triggeredRedFlags.length > 0 && (
                <div className="rounded-[32px] border border-[#D8D2C6] bg-white p-6 shadow-[0_16px_50px_rgba(44,42,38,0.04)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[#C75B5B]/10 p-3">
                      <ShieldAlert className="h-5 w-5 text-[#A54B4B]" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Anti-Pattern Agent</div>
                      <h3 className="mt-1 text-xl font-semibold">Triggered red flags</h3>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {triggeredRedFlags.map((flag) => (
                      <div key={flag.key} className="rounded-[22px] border border-[#D8D2C6] bg-[#FAF8F3] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold text-[#2C2A26]">{flag.label}</h4>
                          <span className="rounded-full bg-[#2C2A26]/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#5D5A53]">{flag.severity}</span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[#5D5A53]">{flag.explanation}</p>
                        <p className="mt-2 text-sm leading-6 text-[#2C2A26]">{flag.mitigation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {activeResult.result.frameworks.map((framework, index) => (
                    <FrameworkCard key={framework.key} framework={framework} index={index} />
                  ))}
                </div>
                <div className="rounded-[32px] border border-[#D8D2C6] bg-white p-6 shadow-[0_16px_50px_rgba(44,42,38,0.04)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[#F5F2EB] p-3">
                      <Sparkles className="h-5 w-5 text-[#2C2A26]" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Governance Notes</div>
                      <h3 className="mt-1 text-xl font-semibold">What must be true before launch</h3>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {activeResult.result.governanceNotes.map((note) => (
                      <div key={note} className="rounded-[22px] border border-[#D8D2C6] bg-[#FAF8F3] p-4 text-sm leading-6 text-[#5D5A53]">
                        {note}
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 rounded-[24px] bg-[#F5F2EB] p-5">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Result Summary</div>
                    <p className="mt-2 text-sm leading-6 text-[#2C2A26]">{activeResult.result.summary}</p>
                  </div>
                </div>
              </div>

              {agentOutputs.length > 0 && (
                <div className="rounded-[32px] border border-[#D8D2C6] bg-white p-6 shadow-[0_16px_50px_rgba(44,42,38,0.04)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[#F5F2EB] p-3">
                      <BrainCircuit className="h-5 w-5 text-[#2C2A26]" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Structured Agent Outputs</div>
                      <h3 className="mt-1 text-xl font-semibold">Agent trace</h3>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3">
                    {agentOutputs.map((agent, index) => (
                      <AgentTraceCard key={`${agent.key}-${index}`} agent={agent} index={index} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <section className="mx-auto max-w-[1600px] px-6 pb-12 md:px-10">
        <div className="rounded-[36px] border border-[#D8D2C6] bg-white p-6 shadow-[0_18px_60px_rgba(44,42,38,0.05)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[#F5F2EB] p-3">
                <History className="h-5 w-5 text-[#2C2A26]" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Public History</div>
                <h2 className="mt-1 text-2xl font-serif">Recent gates</h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-[#2C2A26]/45" />
              {(['all', 'REJECT', 'DEFER', 'APPROVE (Assistive)', 'APPROVE (Constrained Autonomy)', 'APPROVE (Autonomous)', 'rejected'] as const).map((filter) => {
                const isActive = filter === historyFilter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setHistoryFilter(filter)}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      isActive
                        ? 'border-[#2C2A26] bg-[#2C2A26] text-[#F5F2EB]'
                        : 'border-[#D8D2C6] bg-[#FAF8F3] text-[#5D5A53] hover:border-[#2C2A26]/30'
                    }`}
                  >
                    {filter === 'all' ? 'All' : filter}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'n8n', 'fallback', 'decider'] as const).map((filter) => {
                const isActive = filter === historySourceFilter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setHistorySourceFilter(filter)}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      isActive
                        ? 'border-[#2C2A26] bg-[#2C2A26] text-[#F5F2EB]'
                        : 'border-[#D8D2C6] bg-[#FAF8F3] text-[#5D5A53] hover:border-[#2C2A26]/30'
                    }`}
                  >
                    {historySourceFilterLabel(filter)}
                  </button>
                );
              })}
            </div>
          </div>

          {historyError && (
            <div className="mt-5 rounded-[22px] border border-[#C75B5B]/20 bg-[#C75B5B]/10 p-4 text-sm text-[#A54B4B]">
              Recent Gates failed to load: {historyError}
            </div>
          )}

          <div className="mt-6 grid gap-3">
            {isHistoryLoading ? (
              <div className="flex items-center justify-center rounded-[24px] border border-dashed border-[#D8D2C6] bg-[#FAF8F3] p-10 text-sm text-[#5D5A53]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading public history
              </div>
            ) : filteredHistory.length ? (
              filteredHistory.map((item) => (
                <button
                  key={item.assessmentId}
                  type="button"
                  onClick={() => handleSelectHistory(item)}
                  className="rounded-[24px] border border-[#D8D2C6] bg-[#FAF8F3] p-4 text-left transition hover:border-[#2C2A26]/35 hover:bg-white"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                          item.decisionLabel ? decisionStyles[item.decisionLabel as GatingDecisionLabel] : 'border-[#D8D2C6] bg-white text-[#5D5A53]'
                        }`}>
                          {item.decisionLabel || item.status}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${sourceStyles[item.resultSource || 'fallback']}`}>
                          {resultSourceLabel(item.resultSource)}
                        </span>
                        {item.taxonomyType && (
                          <span className="rounded-full border border-[#D8D2C6] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5D5A53]">
                            {item.taxonomyType}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-3 truncate text-base font-semibold text-[#2C2A26]">{item.title}</h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#5D5A53]">{item.ideaText}</p>
                    </div>
                    <div className="grid shrink-0 gap-2 text-xs text-[#5D5A53] sm:grid-cols-3 lg:w-[430px]">
                      <span>{formatDateTime(item.completedAt || item.createdAt)}</span>
                      <span>{formatDuration(item.durationMs)}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5" />
                        View result
                      </span>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="flex items-center justify-center rounded-[24px] border border-dashed border-[#D8D2C6] bg-[#FAF8F3] p-10 text-sm text-[#5D5A53]">
                {history.length
                  ? `No ${historySourceFilterLabel(historySourceFilter)} gates match ${historyDecisionFilterLabel(historyFilter)} yet.`
                  : 'No public gates yet. Run an assessment to create the first shared history row.'}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AIGatingApp;
