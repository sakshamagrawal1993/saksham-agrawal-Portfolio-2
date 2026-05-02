import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BrainCircuit,
  Database,
  Loader2,
  ShieldCheck,
  Sparkles,
  Workflow,
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
import { IDEA_PRESETS, evaluateIdeaWithAiGate } from './aiGateApi';
import type {
  AutomationLevel,
  FrameworkScore,
  GatingDecisionLabel,
  GatingEvaluationResponse,
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

const automationSteps: AutomationLevel[] = [
  'Deterministic only',
  'Classical ML first',
  'Assistive AI',
  'Constrained autonomy',
  'Autonomous agent',
];

const frameworkColors = ['#2C2A26', '#6B8F71', '#D4A574', '#7396C8', '#C75B5B'];

const quadrantCards = [
  {
    key: 'High Reliability + Low Stakes',
    title: 'Sweet Spot',
    body: 'Autonomous AI is viable when misses are recoverable and value compounds with scale.',
  },
  {
    key: 'Low Reliability + Low Stakes',
    title: 'Playground',
    body: 'User-driven AI and experimentation work well when the downside is light.',
  },
  {
    key: 'High Reliability + High Stakes',
    title: 'Danger Zone',
    body: 'Use validators, experts, and rollback controls when the answer needs to be right and the cost of being wrong is high.',
  },
  {
    key: 'Low Reliability + High Stakes',
    title: 'Prohibited Zone',
    body: 'This is where AI should not act autonomously. Redesign the workflow instead.',
  },
];

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

const AIGatingApp: React.FC<AIGatingAppProps> = ({ onBack }) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(IDEA_PRESETS[0].id);
  const [customIdea, setCustomIdea] = useState('');
  const [activeResult, setActiveResult] = useState<GatingEvaluationResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPreset = IDEA_PRESETS.find((preset) => preset.id === selectedPresetId) ?? IDEA_PRESETS[0];
  const effectiveIdea = customIdea.trim() || selectedPreset.ideaText;
  const effectiveTitle = customIdea.trim() ? 'Custom Idea' : selectedPreset.title;

  const radarData = useMemo(() => {
    if (!activeResult) return [];
    const { dice } = activeResult.result;
    return [
      { subject: 'Determinism', value: dice.determinism, fullMark: 5 },
      { subject: 'Input', value: dice.inputComplexity, fullMark: 5 },
      { subject: 'Error', value: dice.costOfError, fullMark: 5 },
      { subject: 'Economics', value: dice.economics, fullMark: 5 },
    ];
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

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await evaluateIdeaWithAiGate({
        title: effectiveTitle,
        ideaText: effectiveIdea,
        source: customIdea.trim() ? 'custom' : 'preset',
        presetId: customIdea.trim() ? undefined : selectedPreset.id,
      });
      setActiveResult(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to evaluate the idea right now.');
    } finally {
      setIsSubmitting(false);
    }
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
            Save idea / run workflow / return decision architecture
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-8 px-6 py-8 md:px-10 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <div className="overflow-hidden rounded-[32px] border border-[#D8D2C6] bg-[radial-gradient(circle_at_top_left,_rgba(212,165,116,0.18),_transparent_42%),linear-gradient(180deg,#fffdf9_0%,#f7f2ea_100%)] p-6 shadow-[0_20px_60px_rgba(44,42,38,0.05)]">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#2C2A26]/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2C2A26]/70">
              <Sparkles className="h-3.5 w-3.5" />
              Build Decision Demo
            </div>
            <h2 className="mt-4 text-3xl font-serif leading-tight">Should this idea even be built with AI?</h2>
            <p className="mt-3 text-sm leading-6 text-[#5D5A53]">
              Start from the article’s real gate: classify the problem, score DICE, pressure-test reliability vs stakes, then choose the smallest viable solver.
            </p>

            <div className="mt-6 grid gap-3">
              {IDEA_PRESETS.map((preset) => {
                const isActive = preset.id === selectedPresetId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={`rounded-[24px] border p-4 text-left transition-all ${
                      isActive
                        ? 'border-[#2C2A26] bg-[#2C2A26] text-[#F5F2EB] shadow-lg'
                        : 'border-[#D8D2C6] bg-white text-[#2C2A26] hover:border-[#2C2A26]/35 hover:shadow-sm'
                    }`}
                  >
                    <div className={`text-[10px] uppercase tracking-[0.18em] ${isActive ? 'text-[#F5F2EB]/55' : 'text-[#2C2A26]/45'}`}>
                      {preset.subtitle}
                    </div>
                    <div className="mt-1 text-sm font-semibold">{preset.title}</div>
                    <div className={`mt-2 text-xs leading-5 ${isActive ? 'text-[#F5F2EB]/72' : 'text-[#5D5A53]'}`}>{preset.hint}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-[28px] border border-[#D8D2C6] bg-white/80 p-5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#2C2A26]/50">
                Or enter your own idea
              </label>
              <textarea
                value={customIdea}
                onChange={(event) => setCustomIdea(event.target.value)}
                className="mt-3 h-40 w-full resize-none rounded-[20px] border border-[#D8D2C6] bg-[#FAF8F3] px-4 py-4 text-sm leading-6 text-[#2C2A26] outline-none transition focus:border-[#2C2A26]/35 focus:bg-white"
                placeholder="Describe the workflow, the input, the decision being made, and what action you want AI to take."
              />
              <div className="mt-4 flex items-center justify-between gap-4">
                <div className="text-xs leading-5 text-[#5D5A53]">
                  The submission is stored against an ID when the edge function is configured. If not, the demo falls back to a local preview model.
                </div>
                <button
                  type="button"
                  onClick={handleEvaluate}
                  disabled={isSubmitting}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#2C2A26] px-5 py-3 text-sm font-semibold text-[#F5F2EB] transition hover:bg-[#3C3934] disabled:cursor-not-allowed disabled:opacity-60"
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
              {error && <p className="mt-3 text-sm text-[#A54B4B]">{error}</p>}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          {!activeResult ? (
            <div className="flex min-h-[70vh] flex-col items-center justify-center rounded-[36px] border border-dashed border-[#D8D2C6] bg-white/60 px-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2C2A26]/5">
                <Database className="h-7 w-7 text-[#2C2A26]/40" />
              </div>
              <h2 className="mt-5 text-2xl font-serif">Awaiting an idea</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#5D5A53]">
                Pick a preset or paste your own concept. The result will show the taxonomy class, DICE graph, automation recommendation, and the final answer to whether this should be built with an LLM at all.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-[36px] border border-[#D8D2C6] bg-[linear-gradient(135deg,#2C2A26_0%,#4C453D_45%,#6B8F71_100%)] p-8 text-[#F5F2EB] shadow-[0_30px_90px_rgba(44,42,38,0.12)]">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#F5F2EB]/62">
                      Assessment ID {activeResult.assessmentId}
                    </div>
                    <h2 className="mt-3 text-3xl font-serif leading-tight md:text-4xl">{activeResult.result.title}</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#F5F2EB]/76">{activeResult.result.ideaText}</p>
                    <p className="mt-5 max-w-2xl text-base leading-7 text-[#F5F2EB]/90">{activeResult.result.conclusion}</p>
                  </div>
                  <div className="grid w-full max-w-sm gap-3">
                    <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${decisionStyles[activeResult.result.route.decisionLabel]}`}>
                      {activeResult.result.route.decisionLabel}
                    </div>
                    <ResultBadge label="Recommended Solver" value={activeResult.result.route.solver} />
                    <ResultBadge label="Automation Level" value={activeResult.result.route.automationLevel} tone="highlight" />
                  </div>
                </div>
                {activeResult.result.simulated && (
                  <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-[#F5F2EB]/80">
                    <Sparkles className="h-3.5 w-3.5" />
                    Preview mode: using a local scoring fallback because the Supabase edge function is not reachable from this environment.
                  </div>
                )}
              </div>

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
                    <ResultBadge label="Determinism" value={`${activeResult.result.dice.determinism}/5`} />
                    <ResultBadge label="Input Complexity" value={`${activeResult.result.dice.inputComplexity}/5`} />
                    <ResultBadge label="Cost of Error" value={`${activeResult.result.dice.costOfError}/5`} />
                    <ResultBadge label="Economics" value={`${activeResult.result.dice.economics}/5`} />
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
                  <div className="mt-6 rounded-[24px] bg-[#FAF8F3] p-5">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[#2C2A26]/45">Build Recommendation</div>
                    <p className="mt-2 text-sm leading-6 text-[#2C2A26]">{activeResult.result.buildRecommendation}</p>
                  </div>
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
                  <p className="mt-4 text-sm leading-6 text-[#5D5A53]">{activeResult.result.reliability.strategy}</p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {quadrantCards.map((card) => {
                      const isActive = card.key === activeResult.result.reliability.quadrant;
                      return (
                        <div
                          key={card.key}
                          className={`rounded-[24px] border p-4 ${
                            isActive ? 'border-[#2C2A26] bg-[#2C2A26] text-[#F5F2EB]' : 'border-[#D8D2C6] bg-[#FAF8F3] text-[#2C2A26]'
                          }`}
                        >
                          <div className={`text-[10px] uppercase tracking-[0.2em] ${isActive ? 'text-[#F5F2EB]/60' : 'text-[#2C2A26]/45'}`}>{card.title}</div>
                          <p className={`mt-2 text-sm leading-6 ${isActive ? 'text-[#F5F2EB]/85' : 'text-[#5D5A53]'}`}>{card.body}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <ResultBadge label="Reliability Need" value={`${activeResult.result.reliability.requirement}/5`} />
                    <ResultBadge label="Failure Stakes" value={`${activeResult.result.reliability.stakes}/5`} />
                  </div>
                </div>
              </div>

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
            </>
          )}
        </section>
      </main>
    </div>
  );
};

export default AIGatingApp;
