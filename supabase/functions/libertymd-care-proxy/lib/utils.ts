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

/** The trimmed patient shape sent to n8n. No PHI beyond what inference needs. */
export function patientPayload(profile: JsonObject | PatientRow | null) {
  if (!profile) return {}
  const row = profile as unknown as JsonObject
  return {
    name: row.display_name || row.display_label || undefined,
    age: row.age || undefined,
    sex: row.sex_at_birth || undefined,
  }
}
