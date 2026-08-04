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

/**
 * Formats transcript history into clear Q -> A pairs for n8n inference nodes.
 *
 * Strips unselected options noise from assistant turns so n8n only receives
 * Question + Selected Option chosen by user, preventing option list confusion
 * and repeated questions.
 */
export function formatHistoryForInference(history: unknown[]): JsonObject[] {
  if (!Array.isArray(history)) return []

  const formatted: JsonObject[] = []

  for (let i = 0; i < history.length; i++) {
    const item = history[i]
    if (!item || typeof item !== 'object') continue
    const msg = item as Record<string, unknown>
    const role = String(msg.role || '').toLowerCase()
    const content = String(msg.content || '').trim()

    if (role === 'user') {
      const prevMsg = i > 0 && typeof history[i - 1] === 'object' ? (history[i - 1] as Record<string, unknown>) : null
      const prevRole = prevMsg ? String(prevMsg.role || '').toLowerCase() : ''
      const prevQuestion = prevMsg && prevRole === 'assistant' ? String(prevMsg.content || '').trim() : null

      formatted.push({
        role: 'user',
        content: content,
        ...(prevQuestion ? { question: prevQuestion } : {}),
        qa_pair: prevQuestion ? `Q: ${prevQuestion} -> A: ${content}` : `User: ${content}`,
      })
    } else if (role === 'assistant') {
      // Omit unselected options array from assistant history turn so n8n sees clean question text
      formatted.push({
        role: 'assistant',
        content: content,
        ...(msg.target_slot ? { target_slot: String(msg.target_slot) } : {}),
      })
    } else if (role === 'system') {
      formatted.push({
        role: 'system',
        content: content,
      })
    }
  }

  return formatted
}
