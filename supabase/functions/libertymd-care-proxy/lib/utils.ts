/**
 * Pure helpers: no database access, no n8n calls, no side effects beyond timing.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 */
import type { User } from 'https://esm.sh/@supabase/supabase-js@2'
import type { JsonObject, PatientRow } from './types.ts'

export function addDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function cleanMessage(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 4000)
}

export function limitConsultationMessage(value: unknown) {
  const sourceParagraphs = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)

  const sentenceGroups = sourceParagraphs.map((paragraph) => (
    paragraph.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [paragraph]
  ))
  const sentences = sentenceGroups.flat().slice(0, 5)
  if (sentences.length <= 3) {
    const firstParagraphSize = sentenceGroups[0]?.length || sentences.length
    if (sentenceGroups.length > 1 && firstParagraphSize < sentences.length) {
      return `${sentences.slice(0, firstParagraphSize).join(' ')}\n\n${sentences.slice(firstParagraphSize).join(' ')}`.slice(0, 2000)
    }
    return sentences.join(' ').slice(0, 2000)
  }

  const preferredFirstParagraphSize = sentenceGroups.length > 1
    ? sentenceGroups[0].length
    : Math.ceil(sentences.length / 2)
  const firstParagraphSize = Math.min(3, Math.max(sentences.length - 3, preferredFirstParagraphSize))
  return `${sentences.slice(0, firstParagraphSize).join(' ')}\n\n${sentences.slice(firstParagraphSize).join(' ')}`.slice(0, 2000)
}

export async function timed<T>(operation: () => Promise<T>) {
  const startedAt = performance.now()
  const value = await operation()
  return { value, ms: Math.round(performance.now() - startedAt) }
}

export function firstName(user: User) {
  const metadata = user.user_metadata || {}
  const name = String(metadata.full_name || metadata.name || '').trim()
  return name ? name.split(/\s+/)[0] : ''
}

export function displayName(user: User) {
  const metadata = user.user_metadata || {}
  return String(metadata.full_name || metadata.name || '').trim() || null
}

export function avatarUrl(user: User) {
  const metadata = user.user_metadata || {}
  return String(metadata.avatar_url || metadata.picture || '').trim() || null
}

/** The trimmed patient shape sent to n8n. Supplies complete demographic information. */
export function patientPayload(profile: JsonObject | PatientRow | null) {
  if (!profile || typeof profile !== 'object') return {}
  const row = profile as unknown as JsonObject

  const name = String(row.display_label || row.display_name || row.name || row.full_name || '').trim() || undefined
  const age = typeof row.age === 'number' ? row.age : typeof row.age_years === 'number' ? row.age_years : row.age ? Number(row.age) : undefined
  const sex = String(row.sex_at_birth || row.gender || row.sex || '').trim().toLowerCase() || undefined
  const medicalHistory = String(row.medical_history || row.history || row.relevant_history || '').trim() || undefined

  return {
    name: name || 'Patient',
    display_label: name || 'Patient',
    age: age || undefined,
    age_years: age || undefined,
    sex: sex || undefined,
    gender: sex || undefined,
    sex_at_birth: sex || undefined,
    medical_history: medicalHistory || undefined,
    relevant_history: medicalHistory || undefined,
  }
}

export interface FormattedHistoryTurn {
  speaker: 'Patient' | 'Doctor'
  role: 'user' | 'assistant'
  text: string
  content: string
}

/**
 * Formats transcript history into clean Patient : {Text} / Doctor : {Text} turns.
 * Completely strips non-essential metadata (id, created_at, target_slot, message_type, options, etc.).
 */
export function formatHistoryForInference(history: unknown[]): FormattedHistoryTurn[] {
  if (!Array.isArray(history)) return []

  const formatted: FormattedHistoryTurn[] = []

  for (let i = 0; i < history.length; i++) {
    const item = history[i]
    if (!item || typeof item !== 'object') continue
    const msg = item as Record<string, unknown>
    const role = String(msg.role || '').toLowerCase()
    const content = String(msg.content || '').trim()
    if (!content) continue

    if (role === 'user') {
      formatted.push({
        speaker: 'Patient',
        role: 'user',
        text: content,
        content: content,
      })
    } else if (role === 'assistant') {
      formatted.push({
        speaker: 'Doctor',
        role: 'assistant',
        text: content,
        content: content,
      })
    }
  }

  return formatted
}

/**
 * Builds a clean multi-line transcript string for direct LLM prompts:
 * 
 * Patient: [text]
 * Doctor: [text]
 * Patient: [text]
 */
export function buildConversationTranscript(history: unknown[]): string {
  const turns = formatHistoryForInference(history)
  return turns.map((turn) => `${turn.speaker}: ${turn.text}`).join('\n')
}

/**
 * Extract concise Q -> A pairs from history turns for high-density LLM prompts.
 * Pairs Doctor's question with Patient's chosen option / text response.
 */
export function buildQASummary(history: unknown[]): string {
  if (!Array.isArray(history)) return ''

  const qaPairs: string[] = []

  for (let i = 0; i < history.length; i++) {
    const item = history[i]
    if (!item || typeof item !== 'object') continue
    const msg = item as Record<string, unknown>
    const role = String(msg.role || '').toLowerCase()
    const content = String(msg.content || '').trim()

    if (role === 'user' && content) {
      // Find preceding Doctor question
      const prevMsg = i > 0 && typeof history[i - 1] === 'object' ? (history[i - 1] as Record<string, unknown>) : null
      const prevRole = prevMsg ? String(prevMsg.role || '').toLowerCase() : ''
      const prevQuestion = prevMsg && prevRole === 'assistant' ? String(prevMsg.content || '').trim() : null

      if (prevQuestion) {
        // Strip multiple choice options if embedded in question text for max information density
        const cleanQ = prevQuestion.split('\n')[0].replace(/\?.*$/, '?').trim()
        qaPairs.push(`Q: ${cleanQ} -> A: ${content}`)
      } else {
        qaPairs.push(`Patient: ${content}`)
      }
    }
  }

  return qaPairs.join('\n')
}

/**
 * Builds a high-information-density context block combining Patient Demographics,
 * Filled Clinical Slots, and Structured Dialogue.
 */
export function buildDenseContext(
  history: unknown[],
  patient?: Record<string, unknown> | null,
  slots?: Record<string, unknown> | null
): string {
  const parts: string[] = []

  // Demographics
  if (patient && typeof patient === 'object') {
    const age = patient.age || patient.age_years || ''
    const sex = patient.sex || patient.gender || ''
    const medHistory = patient.medical_history || patient.relevant_history || ''
    const demoStr = [
      age ? `Age: ${age}` : '',
      sex ? `Sex: ${sex}` : '',
      medHistory ? `Medical History: ${medHistory}` : '',
    ].filter(Boolean).join(' | ')
    if (demoStr) {
      parts.push(`[PATIENT DEMOGRAPHICS]\n${demoStr}`)
    }
  }

  // Filled slots
  if (slots && typeof slots === 'object') {
    const activeSlots = Object.entries(slots)
      .filter(([_, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    if (activeSlots.length > 0) {
      parts.push(`[EXTRACTED CLINICAL FINDINGS]\n${activeSlots.join('\n')}`)
    }
  }

  // QA Summary & Dialogue Transcript
  const qa = buildQASummary(history)
  if (qa) {
    parts.push(`[QUESTION-ANSWER SUMMARY]\n${qa}`)
  } else {
    const transcript = buildConversationTranscript(history)
    if (transcript) {
      parts.push(`[CONVERSATION TRANSCRIPT]\n${transcript}`)
    }
  }

  return parts.join('\n\n')
}
