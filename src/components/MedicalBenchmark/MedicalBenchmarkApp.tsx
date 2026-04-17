import React, { useMemo, useState } from 'react';
import rawCases from '../../data/jivi_cases.json';
import { ArrowLeft, Stethoscope, Activity, CheckCircle2, ChevronRight, Loader2, Link2 } from 'lucide-react';
import {
  buildBacklinksByRelation,
  normalizeMedicalCases,
  relationKeysWithBacklinks,
  relationKeysWithEdges,
  type BacklinksByRelation,
  type MedicalCase,
} from '../../lib/medicalCaseGraph';
import { RELATIONSHIP_UI_LABEL, type WikilinkRelationshipKey } from '../../lib/wikilinkRelationshipTypes';

interface MedicalBenchmarkAppProps {
  onBack: () => void;
}

function TypedLinkSection({
  title,
  relationKeys,
  getRefs,
  onSelectCase,
  accentClass,
}: {
  title: string;
  relationKeys: WikilinkRelationshipKey[];
  getRefs: (rel: WikilinkRelationshipKey) => { id: string; title: string }[];
  onSelectCase: (id: string) => void;
  accentClass: string;
}) {
  if (!relationKeys.length) return null;
  return (
    <div className="rounded-2xl border border-[#2C2A26]/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className={`rounded-lg p-2 ${accentClass}`}>
          <Link2 className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold text-[#2C2A26]">{title}</h3>
      </div>
      <div className="space-y-4">
        {relationKeys.map((rel) => {
          const refs = getRefs(rel);
          if (!refs.length) return null;
          return (
            <div key={rel}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#2C2A26]/50">
                {RELATIONSHIP_UI_LABEL[rel]} <span className="font-mono text-[10px] normal-case text-[#2C2A26]/40">({rel})</span>
              </p>
              <ul className="space-y-1.5">
                {refs.map((r) => (
                  <li key={`${rel}-${r.id}`}>
                    <button
                      type="button"
                      onClick={() => onSelectCase(r.id)}
                      className="w-full rounded-lg border border-[#2C2A26]/10 bg-[#FAFAF8] px-3 py-2 text-left text-sm text-[#2C2A26] transition hover:border-blue-500/40 hover:bg-white"
                    >
                      <span className="font-mono text-xs text-blue-600">{r.id}</span>
                      <span className="mt-0.5 block font-medium leading-snug">{r.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MedicalBenchmarkApp: React.FC<MedicalBenchmarkAppProps> = ({ onBack }) => {
  const cases = useMemo(() => normalizeMedicalCases(rawCases as MedicalCase[]), []);
  const backlinksByTarget = useMemo(() => buildBacklinksByRelation(cases), [cases]);
  const caseById = useMemo(() => new Map(cases.map((c) => [c.id, c] as const)), [cases]);

  const [selectedCase, setSelectedCase] = useState<MedicalCase | null>(null);
  const [inputText, setInputText] = useState('');
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosisResults, setDiagnosisResults] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCaseSelect = (c: MedicalCase) => {
    setSelectedCase(c);
    setInputText(c.case_text);
    setDiagnosisResults(null);
    setError(null);
  };

  const backlinkCount = (id: string) => {
    const bl = backlinksByTarget.get(id);
    if (!bl) return 0;
    return relationKeysWithBacklinks(bl).reduce((n, k) => n + (bl[k]?.length ?? 0), 0);
  };

  const handleDiagnose = async () => {
    if (!selectedCase || !inputText.trim()) return;

    setIsDiagnosing(true);
    setError(null);
    setDiagnosisResults(null);

    try {
      const WEBHOOK_URL = import.meta.env.VITE_N8N_BENCHMARK_WEBHOOK_URL || 'http://localhost:5678/webhook/medical-benchmark';

      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caseId: selectedCase.id,
          caseText: inputText,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.diagnoses && Array.isArray(data.diagnoses)) {
        setDiagnosisResults(data.diagnoses);
      } else {
        setDiagnosisResults(['Error: Unexpected format', JSON.stringify(data)]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect to the diagnosis service.';
      setError(message);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const selectedBacklinks: BacklinksByRelation | undefined = selectedCase
    ? backlinksByTarget.get(selectedCase.id)
    : undefined;
  const outboundKeys = selectedCase ? relationKeysWithEdges(selectedCase.links) : [];
  const inboundKeys = selectedCase ? relationKeysWithBacklinks(selectedBacklinks) : [];

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F2EB] font-sans text-[#2C2A26]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#2C2A26]/10 bg-[#F5F2EB]/90 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center justify-center rounded-full p-2 text-[#2C2A26]/60 transition-colors hover:bg-[#2C2A26]/5 hover:text-[#2C2A26]"
            title="Back to Portfolio"
            type="button"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#2C2A26] p-2 shadow-sm">
              <Stethoscope className="h-5 w-5 text-[#F5F2EB]" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[#2C2A26]">Jivi Diagnostics Benchmark</h1>
              <p className="text-xs font-medium text-[#2C2A26]/60">Medical Case Analysis Orchestrator</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-r border-[#2C2A26]/10 bg-white lg:w-[380px]">
          <div className="border-b border-[#2C2A26]/5 bg-[#FAFAF8] px-6 py-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#2C2A26]/70">Test Cases</h2>
            <p className="mt-1 text-xs text-[#2C2A26]/50">Typed links use the same 30 relationship keys as the Obsidian vault</p>
          </div>

          <div className="space-y-2 p-4">
            {cases.map((c) => {
              const isSelected = selectedCase?.id === c.id;
              const nBack = backlinkCount(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleCaseSelect(c)}
                  className={`w-full rounded-xl border p-4 text-left transition-all duration-200 ${
                    isSelected
                      ? 'scale-[1.02] transform border-[#2C2A26] bg-[#2C2A26] shadow-md'
                      : 'border-[#2C2A26]/10 bg-white hover:border-[#2C2A26]/30 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className={`mb-1 text-xs font-semibold tracking-wider ${isSelected ? 'text-[#D6D1C7]' : 'text-blue-600'}`}>
                        {c.id}
                      </div>
                      <h3 className={`line-clamp-2 font-medium ${isSelected ? 'text-[#F5F2EB]' : 'text-[#2C2A26]'}`}>{c.title}</h3>
                    </div>
                    {nBack > 0 && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          isSelected ? 'bg-[#F5F2EB]/15 text-[#F5F2EB]' : 'bg-blue-50 text-blue-700'
                        }`}
                        title="Notes linking to this case (backlinks)"
                      >
                        {nBack} in
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="relative flex flex-1 flex-col overflow-y-auto bg-[#FAFAF8] p-6 md:p-10">
          {!selectedCase ? (
            <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#2C2A26]/5">
                <Activity className="h-8 w-8 text-[#2C2A26]/40" />
              </div>
              <h2 className="mb-2 text-2xl font-semibold">Awaiting Selection</h2>
              <p className="leading-relaxed text-[#2C2A26]/60">
                Select a benchmark medical case from the sidebar to load the patient vitals, symptoms, and medical history.
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-4xl space-y-8 pb-12 duration-500 animate-in fade-in slide-in-from-bottom-4">
              <div className="rounded-2xl border border-[#2C2A26]/10 bg-white p-6 shadow-sm md:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-[#2C2A26]">{selectedCase.title}</h2>
                    <p className="mt-1 text-sm text-[#2C2A26]/60">Patient History & Current Symptoms</p>
                  </div>
                </div>

                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={isDiagnosing}
                  className="h-48 w-full resize-none rounded-xl border border-[#2C2A26]/15 bg-[#FAFAF8] p-4 leading-relaxed text-[#2C2A26] transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                  placeholder="Enter medical case specifics..."
                />

                <div className="mt-6 flex items-center justify-between">
                  <div className="text-sm text-[#2C2A26]/50">Feel free to modify the prompt before analyzing.</div>
                  <button
                    type="button"
                    onClick={handleDiagnose}
                    disabled={isDiagnosing || !inputText.trim()}
                    className="group flex items-center gap-2 rounded-xl bg-[#2C2A26] px-6 py-3 font-medium text-[#F5F2EB] shadow-md transition-all hover:bg-black hover:shadow-lg focus:ring-2 focus:ring-[#2C2A26] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDiagnosing ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Analyzing via n8n...
                      </>
                    ) : (
                      <>
                        Diagnose
                        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </button>
                </div>
                {error && (
                  <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">{error}</div>
                )}
              </div>

              {!outboundKeys.length && !inboundKeys.length ? (
                <p className="rounded-xl border border-dashed border-[#2C2A26]/15 bg-white/80 px-4 py-3 text-center text-sm text-[#2C2A26]/55">
                  No typed graph edges for this case yet. Add a <code className="rounded bg-[#2C2A26]/5 px-1 font-mono text-xs">links</code> object to this entry in{' '}
                  <code className="rounded bg-[#2C2A26]/5 px-1 font-mono text-xs">src/data/jivi_cases.json</code> using keys from{' '}
                  <code className="rounded bg-[#2C2A26]/5 px-1 font-mono text-xs">src/lib/wikilinkRelationshipTypes.ts</code>.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <TypedLinkSection
                    title="Outbound typed links"
                    relationKeys={outboundKeys}
                    getRefs={(rel) =>
                      (selectedCase.links?.[rel] ?? [])
                        .map((id) => caseById.get(id))
                        .filter((c): c is MedicalCase => Boolean(c))
                        .map((c) => ({ id: c.id, title: c.title }))
                    }
                    onSelectCase={(id) => {
                      const next = caseById.get(id);
                      if (next) handleCaseSelect(next);
                    }}
                    accentClass="bg-blue-50 text-blue-600"
                  />
                  <TypedLinkSection
                    title="Backlinks (by relationship)"
                    relationKeys={inboundKeys}
                    getRefs={(rel) => selectedBacklinks?.[rel] ?? []}
                    onSelectCase={(id) => {
                      const next = caseById.get(id);
                      if (next) handleCaseSelect(next);
                    }}
                    accentClass="bg-emerald-50 text-emerald-700"
                  />
                </div>
              )}

              {diagnosisResults && (
                <div className="grid grid-cols-1 gap-6 duration-500 animate-in fade-in slide-in-from-bottom-8 md:grid-cols-2">
                  <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-white p-6 shadow-sm">
                    <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-500" />
                    <div className="mb-6 flex items-center gap-3">
                      <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                        <Activity className="h-5 w-5" />
                      </div>
                      <h3 className="text-lg font-semibold">AI Top 3 Diagnoses</h3>
                    </div>

                    <div className="space-y-3">
                      {diagnosisResults.map((diag, idx) => (
                        <div key={idx} className="flex items-start gap-3 rounded-xl border border-slate-100/60 bg-slate-50 p-3">
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold leading-none text-blue-700">
                            {idx + 1}
                          </div>
                          <p className="pt-0.5 text-sm font-medium leading-snug text-slate-700">{diag}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-white p-6 shadow-sm">
                    <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />
                    <div className="mb-6 flex items-center gap-3">
                      <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <h3 className="text-lg font-semibold">Ground Truth</h3>
                    </div>

                    <div className="flex h-full flex-col">
                      <div className="flex flex-1 flex-col justify-center rounded-xl border border-emerald-100 bg-emerald-50/50 p-6 text-center">
                        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-emerald-600/80">Actual Diagnosis</p>
                        <p className="text-xl font-bold text-emerald-900">{selectedCase.ground_truth}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default MedicalBenchmarkApp;
