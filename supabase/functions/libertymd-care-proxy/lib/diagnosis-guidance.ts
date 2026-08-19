/**
 * P5-GUIDE — per-diagnosis guidance, off the report critical path.
 *
 * A finished report carries FOUR guidance surfaces:
 *   1. `report_data.assessment_and_plan` — consultation-level Recommended
 *      Action Plan. Composed by the diagnosis workflow, served with the report,
 *      and NEVER touched by this module.
 *   2-4. `diagnosis_guidance[]` — one block per reported differential, produced
 *      by the dedicated `libertymd-diagnosis-guidance` workflow after the
 *      report row exists.
 *
 * The dispatch is detached: `handleGenerateReport` returns the report the
 * instant it is persisted, and the guidance run lands later. The client polls
 * only while status is `pending`. Every failure path here is non-fatal — the
 * report is already delivered, so the worst outcome is cards without guidance.
 *
 * Matching is by `full_name`, which both workflows are instructed to keep in
 * canonical clinical English precisely so it survives translation and stays
 * joinable. A block whose name matches no reported differential is dropped
 * rather than rendered against the wrong condition.
 */
import {
  DIAGNOSIS_GUIDANCE_WEBHOOK,
  N8N_TIMEOUT_MS,
  isDiagnosisGuidanceEnabled,
} from './config.ts'
import { postJson } from './n8n-client.ts'
import type { ProxyContext } from './context.ts'
import type { JsonObject } from './types.ts'

export type DiagnosisGuidanceStatus = 'idle' | 'pending' | 'ready' | 'failed'

export interface DiagnosisGuidanceBlock {
  full_name: string
  supportive_treatment: string[]
  symptomatic_treatment: string[]
  further_investigations: string[]
}

/** Bullet caps mirror the workflow's own normalizer; this is the trust boundary. */
const MAX_BULLETS = 4
const MAX_BLOCKS = 3
const MAX_BULLET_CHARS = 160

/**
 * Dosing never reaches a patient surface. The workflow strips it and so does
 * the client mapper (`omitDosingLines`); this is the middle of those three,
 * and the only one that runs on data we did not render ourselves.
 */
const DOSING =
  /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?)\b|\b(?:every|q)\s*\d+\s*(?:h|hr|hrs|hours|days?)\b|\b\d+\s*(?:times?|x)\s*(?:a|per)\s*day\b/i

function cleanBullets(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const line = entry.trim().replace(/\s+/g, ' ').slice(0, MAX_BULLET_CHARS)
    if (!line) continue
    if (DOSING.test(line)) continue
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line)
    if (out.length >= MAX_BULLETS) break
  }
  return out
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Keep only blocks that join onto a differential the report actually contains.
 * Order follows the reported differentials so the client can zip positionally
 * without trusting the workflow's ordering.
 */
export function matchGuidanceToDifferentials(
  raw: unknown,
  differentialNames: string[],
): DiagnosisGuidanceBlock[] {
  const rows = Array.isArray(raw) ? raw : []
  const byName = new Map<string, DiagnosisGuidanceBlock>()

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    const fullName = normalizeName(record.full_name)
    if (!fullName) continue
    const key = fullName.toLowerCase()
    if (byName.has(key)) continue
    const block: DiagnosisGuidanceBlock = {
      full_name: fullName,
      supportive_treatment: cleanBullets(record.supportive_treatment),
      symptomatic_treatment: cleanBullets(record.symptomatic_treatment),
      further_investigations: cleanBullets(record.further_investigations),
    }
    // An all-empty block would render an empty section; it carries no signal.
    if (
      !block.supportive_treatment.length &&
      !block.symptomatic_treatment.length &&
      !block.further_investigations.length
    ) continue
    byName.set(key, block)
  }

  const ordered: DiagnosisGuidanceBlock[] = []
  for (const name of differentialNames) {
    const match = byName.get(normalizeName(name).toLowerCase())
    if (match) ordered.push(match)
    if (ordered.length >= MAX_BLOCKS) break
  }
  return ordered
}

/** Canonical English names of the differentials the report actually shipped. */
export function reportedDifferentialNames(reportData: unknown): string[] {
  const data = reportData && typeof reportData === 'object'
    ? reportData as Record<string, unknown>
    : {}
  const list = Array.isArray(data.differential_diagnosis) ? data.differential_diagnosis : []
  const names: string[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const name = normalizeName((entry as Record<string, unknown>).full_name)
    if (name) names.push(name)
  }
  return names
}

function scheduleDetached(task: Promise<unknown>) {
  const edgeRuntime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void }
  }).EdgeRuntime
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task)
    return
  }
  // Detached fallback: never await on the request path; swallow rejections.
  void task.catch(() => {})
}

async function writeGuidanceState(
  ctx: ProxyContext,
  reportId: string,
  status: DiagnosisGuidanceStatus,
  guidance: DiagnosisGuidanceBlock[] | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    diagnosis_guidance_status: status,
    diagnosis_guidance_updated_at: new Date().toISOString(),
  }
  if (guidance) patch.diagnosis_guidance = guidance
  const { error } = await ctx.db
    .from('libertymd_reports')
    .update(patch)
    .eq('id', reportId)
    .eq('user_id', ctx.user.id)
  if (error) throw error
}

/**
 * Fire the guidance run without awaiting it.
 *
 * Marks the row `pending` BEFORE dispatch so a client that polls immediately
 * sees a reason to keep polling. Returns the status the caller should report,
 * so `get_consultation` and `generate_report` agree on the first response.
 */
export async function dispatchDiagnosisGuidance(
  ctx: ProxyContext,
  input: {
    reportId: string
    consultationId: string
    reportData: JsonObject
    language: string
    clinicalContext?: unknown
  },
): Promise<DiagnosisGuidanceStatus> {
  if (!isDiagnosisGuidanceEnabled()) return 'idle'

  const names = reportedDifferentialNames(input.reportData)
  // Nothing to describe: a report with no differentials has no cards to hydrate.
  if (!names.length) return 'idle'

  try {
    await writeGuidanceState(ctx, input.reportId, 'pending', null)
  } catch {
    // Could not claim the row; skip rather than dispatch a run nobody will store.
    return 'idle'
  }

  const reportData = input.reportData as Record<string, unknown>
  const payload = {
    consultation_id: input.consultationId,
    language: input.language,
    differential_diagnosis: reportData.differential_diagnosis ?? [],
    assessment_and_plan: reportData.assessment_and_plan ?? {},
    clinical_context: input.clinicalContext ?? reportData.clinical_context ?? {},
  }

  scheduleDetached((async () => {
    try {
      // stage `null`: guidance is deliberately outside the inference circuit
      // breaker. It must never open the breaker for guardrail/interview/
      // diagnosis, and a tripped breaker on those must never suppress it.
      const response = await postJson(
        DIAGNOSIS_GUIDANCE_WEBHOOK,
        payload,
        N8N_TIMEOUT_MS.diagnosisGuidance,
        null,
      )
      const body = (response && typeof response === 'object' ? response : {}) as Record<string, unknown>
      const matched = matchGuidanceToDifferentials(body.guidance, names)
      if (!matched.length) {
        await writeGuidanceState(ctx, input.reportId, 'failed', null)
        return
      }
      await writeGuidanceState(ctx, input.reportId, 'ready', matched)
    } catch {
      // Non-fatal by construction: the report is already delivered. Mark failed
      // so the client stops polling instead of spinning on a skeleton forever.
      try {
        await writeGuidanceState(ctx, input.reportId, 'failed', null)
      } catch {
        // Nothing further to do; the pending row ages out via the poll timeout.
      }
    }
  })())

  return 'pending'
}
