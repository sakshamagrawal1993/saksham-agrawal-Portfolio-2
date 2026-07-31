/**
 * P4-09 — Deliberate visual boundary (LibertyMD ↔ portfolio / Dr. Jivi).
 *
 * Source contracts (Deno cannot mount the App shell):
 *   - AC1: separate route trees + LibertyMD Suspense/chrome; no onBack portfolio leave
 *   - AC3: `/liberty-md*` skips Grain; no Saksham cream/ink as LibertyMD page language
 *   - No `components/ui` / `components/AICare` imports from LibertyMD product tree
 *   - AC4: soft-leave / draft keys still defined
 *   - SoT: promoted structure tokens present
 *
 * Run: `deno test --no-config --allow-read tests/libertymd/visual-boundary.test.ts`
 * Wired: `test:libertymd:visual-boundary` → `test:libertymd:ci`
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
  readDir(path: string | URL): AsyncIterable<{ name: string; isFile: boolean }>
}

const ROOT = new URL('../../', import.meta.url)
const APP = new URL('../../App.tsx', import.meta.url)
const TOKENS = new URL('../../design-system/design-tokens.json', import.meta.url)
const DRAFT = new URL('../../components/LibertyMD/libertymd-draft-persistence.ts', import.meta.url)
const CHAT = new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url)
const LIBERTY_DIR = new URL('../../components/LibertyMD/', import.meta.url)

const SAKSHAM_CREAM = '#F5F2EB'
const SAKSHAM_INK = '#2C2A26'

async function listLibertySources(): Promise<string[]> {
  const out: string[] = []
  for await (const entry of Deno.readDir(LIBERTY_DIR)) {
    if (!entry.isFile) continue
    if (!/\.(tsx|ts)$/.test(entry.name)) continue
    if (entry.name.includes('.bak')) continue
    out.push(entry.name)
  }
  return out.sort()
}

Deno.test('P4-09 AC1 · App keeps LibertyMD routes separate and does not wire onBack leave', async () => {
  const app = await Deno.readTextFile(APP)
  if (!app.includes('path="/liberty-md"') || !app.includes('path="/liberty-md/chat"')) {
    throw new Error('LibertyMD route tree missing')
  }
  if (!app.includes('path="/ai-care"')) {
    throw new Error('AI Care route tree must remain separate')
  }
  if (/path="\/liberty-md[^"]*ai-care/.test(app) || /path="\/ai-care[^"]*liberty-md/.test(app)) {
    throw new Error('must not nest ai-care under liberty-md or vice versa')
  }
  if (!app.includes('LibertyMDLoadingFallback') || !app.includes('isLibertyMdClinicalPath')) {
    throw new Error('LibertyMD path-scoped shell helper / Suspense fallback required')
  }
  // Eng Done: do not wire portfolio leave CTA on LibertyMDApp
  if (/<LibertyMDApp[^>]*onBack=/.test(app)) {
    throw new Error('do not wire onBack portfolio leave on LibertyMDApp (P4-09 Q2)')
  }
})

Deno.test('P4-09 AC3 · Grain skipped and Saksham cream/ink not LibertyMD route language', async () => {
  const app = await Deno.readTextFile(APP)
  if (!app.includes('!isLibertyMdRoute && <GrainOverlay') && !app.includes('!isLibertyMdRoute&&<GrainOverlay')) {
    // tolerate whitespace variants
    if (!/!isLibertyMdRoute\s*&&\s*<GrainOverlay/.test(app)) {
      throw new Error('GrainOverlay must be gated off for /liberty-md*')
    }
  }
  if (!app.includes('LibertyMDLoadingFallback')) {
    throw new Error('LibertyMD Suspense fallback required')
  }
  const fallbackStart = app.indexOf('const LibertyMDLoadingFallback')
  if (fallbackStart < 0) throw new Error('LibertyMDLoadingFallback definition missing')
  const fallbackEnd = app.indexOf(';', app.indexOf(')', fallbackStart))
  const fallback = app.slice(fallbackStart, fallbackEnd + 1)
  if (fallback.includes(SAKSHAM_CREAM) || fallback.includes(SAKSHAM_INK)) {
    throw new Error('LibertyMD Suspense fallback must not use Saksham cream/ink')
  }
  if (!fallback.includes('libertymd') && !fallback.includes('--libertymd')) {
    throw new Error('LibertyMD Suspense fallback must use LibertyMD wash/tokens')
  }

  // Wrapper class for liberty routes must not paint cream as page language
  if (!app.includes('isLibertyMdRoute')) {
    throw new Error('isLibertyMdRoute gate required on root wrapper')
  }
  const libertyBranch = app.includes("bg-[image:var(--libertymd-surface-wash)]")
    || app.includes('libertymd-surface-wash')
  if (!libertyBranch) {
    throw new Error('LibertyMD route wrapper must use LibertyMD surface wash, not Saksham cream')
  }
})

Deno.test('P4-09 · LibertyMD product sources do not import components/ui or AICare', async () => {
  const names = await listLibertySources()
  const offenders: string[] = []
  for (const name of names) {
    const src = await Deno.readTextFile(new URL(name, LIBERTY_DIR))
    if (/from\s+['"][^'"]*components\/ui\//.test(src) || /from\s+['"]\.\.\/ui\//.test(src)) {
      offenders.push(`${name}: components/ui`)
    }
    if (/from\s+['"][^'"]*components\/AICare\//.test(src) || /from\s+['"]\.\.\/AICare\//.test(src)) {
      offenders.push(`${name}: AICare`)
    }
    if (src.includes(SAKSHAM_CREAM) || src.includes(SAKSHAM_INK)) {
      // allow comments only if clearly not page language — ban all for honesty
      offenders.push(`${name}: Saksham cream/ink literal`)
    }
    if (/\bbrand-(dark|light|gray|text|gold)\b/.test(src)) {
      offenders.push(`${name}: brand-* class`)
    }
  }
  if (offenders.length) {
    throw new Error(`LibertyMD visual-language leaks:\n- ${offenders.join('\n- ')}`)
  }
})

Deno.test('P4-09 AC2 · SoT includes promoted structure tokens', async () => {
  const raw = await Deno.readTextFile(TOKENS)
  const json = JSON.parse(raw) as {
    libertymd: { color: { neutral: Record<string, { value?: string }>; surface: Record<string, { value?: string }> } }
  }
  const neutral = json.libertymd.color.neutral
  const surface = json.libertymd.color.surface
  const expect: Array<[Record<string, { value?: string }>, string, string]> = [
    [neutral, 'navy', '#17325F'],
    [neutral, 'slate-muted', '#5B6472'],
    [neutral, 'slate-600', '#475569'],
    [neutral, 'slate-400', '#94A3B8'],
    [neutral, 'slate-100', '#F1F5F9'],
    [surface, 'mist', '#DCE6F1'],
  ]
  for (const [bag, key, value] of expect) {
    const got = bag[key]?.value?.toUpperCase()
    if (got !== value.toUpperCase()) {
      throw new Error(`SoT libertymd missing ${key}=${value} (got ${got})`)
    }
  }
  if (!String(surface.wash?.value || '').includes('#FBFCF9')) {
    throw new Error('surface.wash SoT must remain the LibertyMD wash gradient')
  }
})

Deno.test('P4-09 AC4 · soft-leave + draft persistence keys still defined', async () => {
  const chat = await Deno.readTextFile(CHAT)
  const draft = await Deno.readTextFile(DRAFT)
  if (!chat.includes('LIBERTYMD_RECOVERABLE_CONSULTATION_KEY')) {
    throw new Error('recoverable consultation key missing')
  }
  if (!chat.includes('libertymd:recoverableConsultationId')) {
    throw new Error('recoverable sessionStorage key string missing')
  }
  if (!/soft[- ]leave/i.test(chat)) {
    throw new Error('soft-leave contract missing from Chat')
  }
  // Soft-leave path must not invent native dialogs
  if (/\balert\s*\(/.test(chat) || /\bconfirm\s*\(/.test(chat)) {
    throw new Error('Chat must not use alert/confirm (soft-leave / AC4)')
  }
  if (!draft.includes("export const DRAFT_PREFIX = 'libertymd:draft:'")) {
    throw new Error('DRAFT_PREFIX must remain defined')
  }
  if (!draft.includes("export const SCROLL_PREFIX = 'libertymd:scroll:'")) {
    throw new Error('SCROLL_PREFIX must remain defined')
  }
})

Deno.test('P4-09 AC5 · FooterRibbon file still present (frozen surface)', async () => {
  const names = await listLibertySources()
  if (!names.includes('LibertyMDFooterRibbon.tsx')) {
    throw new Error('LibertyMDFooterRibbon.tsx must remain (frozen — do not remove)')
  }
})

/**
 * AC2 regression guard (DEF-1): exact LibertyMD SoT `#RRGGBB` must not appear as
 * raw hex in non-allowlisted product TSX. Art surfaces + FooterRibbon keep raw.
 * PDF helper is `.ts` (out of Eng Done) and intentionally not scanned.
 */
const ART_ALLOWLIST =
  /(Logo|Blob|Particle|Silhouette|Wave|Badge|FooterRibbon|CareOrb)/i

function collectExactSotHexes(node: unknown, out: Set<string>): void {
  if (typeof node === 'string') {
    for (const m of node.matchAll(/#([0-9A-Fa-f]{6})\b/g)) {
      out.add(m[1].toUpperCase())
    }
    return
  }
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectExactSotHexes(item, out)
    return
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    collectExactSotHexes(value, out)
  }
}

Deno.test('P4-09 AC2 · no exact-SoT raw #hex on non-allowlisted product TSX', async () => {
  const raw = await Deno.readTextFile(TOKENS)
  const json = JSON.parse(raw) as { libertymd: { color: unknown } }
  const sot = new Set<string>()
  collectExactSotHexes(json.libertymd.color, sot)

  const names = await listLibertySources()
  const offenders: string[] = []
  for (const name of names) {
    if (!name.endsWith('.tsx')) continue
    if (ART_ALLOWLIST.test(name)) continue
    const src = await Deno.readTextFile(new URL(name, LIBERTY_DIR))
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/design-ok/i.test(line)) continue
      for (const m of line.matchAll(/#([0-9A-Fa-f]{6})\b/g)) {
        const hex = m[1].toUpperCase()
        if (sot.has(hex)) {
          offenders.push(`${name}:${i + 1} #${hex}`)
        }
      }
    }
  }
  if (offenders.length) {
    throw new Error(
      `Exact LibertyMD SoT raw hex on product TSX (use token classes):\n- ${offenders.join('\n- ')}`,
    )
  }
})
