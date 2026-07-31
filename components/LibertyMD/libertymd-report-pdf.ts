/**
 * P2-09 / P2-16 — client-only PDF projection of LibertyMdNormalizedReport.
 *
 * Pure core is Deno-testable (no React). jsPDF loads via dynamic import only
 * when building Blob bytes from a user gesture — never a production Puppeteer /
 * proxy / Storage path. Numeric confidence is omitted (view-model has ordinals only).
 *
 * P2-16: professional template chrome (margins, type hierarchy, legal-tier
 * disclosures, first-page color-mark logo via PNG addImage, light running chrome).
 */

import type {
  LibertyMdNormalizedReport,
  TriageDisplayTier,
} from './libertymd-report'

export type LibertyMdPdfDocKind = 'patient' | 'soap'

/** Localized chrome for PDF headers / section titles (no clinical invention). */
export type LibertyMdPdfCopy = {
  patientTitle: string
  soapTitle: string
  /** Non-clinical label for patient_summary body when headline already used patientTitle. */
  summaryHeading: string
  /** Spec AC3 · “AI-generated — not a diagnosis” (or i18n equivalent). */
  aiGenerated: string
  /** Spec AC3 · explicit no licensed clinician review. */
  noClinicianReview: string
  /** Prefix before UTC date, e.g. "Generated". */
  generatedLabel: string
  sections: {
    triage: string
    nextStep: string
    differential: string
    assessmentAndPlan: string
    redFlags: string
    plan: string
    selfCare: string
    soapSubjective: string
    soapObjective: string
    soapAssessment: string
    soapPlan: string
  }
  ordinal: {
    most_likely: string
    possible: string
    less_likely: string
  }
  serious: string
  triageLabels: Record<TriageDisplayTier, string>
}

export type LibertyMdPdfSection = {
  heading: string
  bodyLines: string[]
}

export type LibertyMdPdfDoc = {
  kind: LibertyMdPdfDocKind
  filename: string
  title: string
  headerLines: string[]
  sections: LibertyMdPdfSection[]
}

/**
 * Layout / brand chrome constants for structured AC contracts (P2-16).
 * Hex values cite design-tokens.json paths — do not invent brand chrome.
 * Logo mark pixels keep approved SVG asset colors (see brandMark in tokens).
 */
export const PDF_MARGIN_PT = 48

/** Max logo height on page 1 (Q8: 28–32 pt). */
export const PDF_LOGO_MAX_HEIGHT_PT = 30

/** Public URL path for the committed color-mark PNG (jsPDF addImage; SVG not embeddable). */
export const PDF_LOGO_ASSET_PATH = '/images/libertymd-logo-mark.png'

/** Repo-relative path for file-existence / CI asserts. */
export const PDF_LOGO_ASSET_REPO_PATH = 'public/images/libertymd-logo-mark.png'

/** Wordmark for light running chrome on pages after the first (no large logo repeat). */
export const PDF_RUNNING_WORDMARK = 'LibertyMD'

/**
 * Type hierarchy (pt) — Helvetica v1 (Q7). Distinct title / section / body / legal tiers.
 */
export const PDF_TYPE_PT = {
  title: 16,
  section: 11,
  body: 10,
  legal: 8,
  running: 8,
} as const

/**
 * Page chrome colors — mapped from design-tokens.json libertymd.color.*.
 * Logo raster keeps SVG-locked navy/blue/mint (libertymd.color.brandMark) — do not recolor.
 */
export const PDF_CHROME_COLORS = {
  /** design-tokens.json → libertymd.color.primary.blue-600 */
  accent: '#2563EB',
  /** design-tokens.json → libertymd.color.neutral.ink-900 */
  ink: '#111827',
  /** design-tokens.json → libertymd.color.neutral.slate-700 */
  section: '#334155',
  /** design-tokens.json → libertymd.color.neutral.slate-500 — legal / label tier */
  legal: '#64748B',
  /** design-tokens.json → libertymd.color.neutral.slate-300 — hairline rules */
  rule: '#CBD5E1',
} as const

/** Vertical budget cap: logo row ≤ ~10% of letter page height before disclosures (Q8). */
export const PDF_LOGO_MAX_FIRST_PAGE_FRACTION = 0.1

export type LibertyMdPdfRenderResultMeta = {
  logoEmbedded: boolean
  kind: LibertyMdPdfDocKind
  pageCount: number
}

export type LibertyMdPdfRenderOptions = {
  /**
   * Injected logo bytes (PNG/JPEG). Prefer in tests; browser path fetches PDF_LOGO_ASSET_PATH.
   * Pass `null` to force omit-logo (still emits PDF).
   */
  logoBytes?: ArrayBuffer | Uint8Array | null
  /** Override fetch/load of the committed PNG. Return null to omit logo. */
  logoLoader?: () => Promise<ArrayBuffer | Uint8Array | null>
  /** Spy hook for AC2 — called after first-page logo attempt. */
  onLogoEmbed?: (meta: { logoEmbedded: boolean; kind: LibertyMdPdfDocKind }) => void
}

/** UTC calendar date YYYY-MM-DD from generation time (AC4). */
export function formatPdfUtcDate(when: Date = new Date()): string {
  const y = when.getUTCFullYear()
  const m = String(when.getUTCMonth() + 1).padStart(2, '0')
  const d = String(when.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Non-clinical filenames only — never diagnosis / symptom / triage / summary.
 * Pattern: LibertyMD-{patient|soap}-YYYY-MM-DD.pdf
 */
export function buildPdfFilename(
  kind: LibertyMdPdfDocKind,
  when: Date = new Date(),
): string {
  return `LibertyMD-${kind}-${formatPdfUtcDate(when)}.pdf`
}

function pushSection(
  sections: LibertyMdPdfSection[],
  heading: string,
  bodyLines: string[],
): void {
  const cleaned = bodyLines
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter((line) => line.length > 0)
  if (!cleaned.length) return
  sections.push({ heading, bodyLines: cleaned })
}

function buildSharedHeader(copy: LibertyMdPdfCopy, when: Date): string[] {
  return [
    `${copy.generatedLabel}: ${formatPdfUtcDate(when)}`,
    copy.aiGenerated,
    copy.noClinicianReview,
  ]
}

/**
 * Patient PDF = patient-facing view-model fields present (S4).
 * Omits missing sections; never invents stubs or numeric %.
 */
export function buildPatientPdfDoc(
  report: LibertyMdNormalizedReport,
  copy: LibertyMdPdfCopy,
  when: Date = new Date(),
): LibertyMdPdfDoc {
  const sections: LibertyMdPdfSection[] = []

  if (report.headline) {
    pushSection(sections, copy.patientTitle, [report.headline])
  }
  if (report.patientSummary) {
    pushSection(
      sections,
      report.headline ? copy.summaryHeading : copy.patientTitle,
      [report.patientSummary],
    )
  }
  if (report.triageTier !== 'unknown' || report.triageRaw) {
    pushSection(sections, copy.sections.triage, [
      copy.triageLabels[report.triageTier] || copy.triageLabels.unknown,
    ])
  }
  if (report.nextStep) {
    pushSection(sections, copy.sections.nextStep, [report.nextStep])
  }
  if (report.differentials.length > 0) {
    const lines: string[] = []
    for (const item of report.differentials) {
      const bits: string[] = [item.name]
      if (item.ordinal) {
        const ordinalLabel = copy.ordinal[item.ordinal]
        bits.push(item.isSerious ? `${ordinalLabel} · ${copy.serious}` : ordinalLabel)
      } else if (item.isSerious) {
        bits.push(copy.serious)
      }
      lines.push(bits.join(' — '))
      if (item.description) lines.push(item.description)
      if (item.reason) lines.push(item.reason)
    }
    pushSection(sections, copy.sections.differential, lines)
  }
  if (report.assessmentAndPlan) {
    const lines: string[] = []
    if (report.assessmentAndPlan.assessment) lines.push(report.assessmentAndPlan.assessment)
    if (report.assessmentAndPlan.plan.length) {
      lines.push(copy.sections.plan)
      for (const item of report.assessmentAndPlan.plan) lines.push(`• ${item}`)
    }
    if (report.assessmentAndPlan.selfCare.length) {
      lines.push(copy.sections.selfCare)
      for (const item of report.assessmentAndPlan.selfCare) lines.push(`• ${item}`)
    }
    pushSection(sections, copy.sections.assessmentAndPlan, lines)
  }
  if (report.redFlags.length > 0) {
    pushSection(
      sections,
      copy.sections.redFlags,
      report.redFlags.map((flag) => `• ${flag}`),
    )
  }

  return {
    kind: 'patient',
    filename: buildPdfFilename('patient', when),
    title: copy.patientTitle,
    headerLines: buildSharedHeader(copy, when),
    sections,
  }
}

/**
 * Physician PDF = SOAP S/O/A/P only (+ shared header). No differential dump.
 */
export function buildSoapPdfDoc(
  report: LibertyMdNormalizedReport,
  copy: LibertyMdPdfCopy,
  when: Date = new Date(),
): LibertyMdPdfDoc {
  const sections: LibertyMdPdfSection[] = []
  const soap = report.soap
  if (soap?.subjective) {
    pushSection(sections, copy.sections.soapSubjective, [soap.subjective])
  }
  if (soap?.objective) {
    pushSection(sections, copy.sections.soapObjective, [soap.objective])
  }
  if (soap?.assessment) {
    pushSection(sections, copy.sections.soapAssessment, [soap.assessment])
  }
  if (soap?.plan) {
    pushSection(sections, copy.sections.soapPlan, [soap.plan])
  }

  return {
    kind: 'soap',
    filename: buildPdfFilename('soap', when),
    title: copy.soapTitle,
    headerLines: buildSharedHeader(copy, when),
    sections,
  }
}

/** Flatten doc for omit / "undefined" / % asserts (AC5). */
export function flattenPdfDocText(doc: LibertyMdPdfDoc): string {
  const parts = [
    doc.title,
    doc.filename,
    ...doc.headerLines,
    ...doc.sections.flatMap((section) => [section.heading, ...section.bodyLines]),
  ]
  return parts.join('\n')
}

/** Structured layout contract for Deno tests (AC1 / AC2 / AC7) — no jsPDF required. */
export function getPdfTemplateContract() {
  return {
    marginPt: PDF_MARGIN_PT,
    logoMaxHeightPt: PDF_LOGO_MAX_HEIGHT_PT,
    logoAssetPath: PDF_LOGO_ASSET_PATH,
    logoAssetRepoPath: PDF_LOGO_ASSET_REPO_PATH,
    logoMaxFirstPageFraction: PDF_LOGO_MAX_FIRST_PAGE_FRACTION,
    runningWordmark: PDF_RUNNING_WORDMARK,
    typePt: { ...PDF_TYPE_PT },
    chromeColors: { ...PDF_CHROME_COLORS },
    fontFamily: 'helvetica' as const,
    logoPages: 'first_only' as const,
    sharedChrome: true,
    legalTierBelowTitle: true,
  }
}

/** Resolve logo bytes for addImage — injectable for Deno tests; fetch in browser. */
export async function resolvePdfLogoBytes(
  options?: LibertyMdPdfRenderOptions,
): Promise<Uint8Array | null> {
  if (options && 'logoBytes' in options) {
    if (options.logoBytes == null) return null
    return options.logoBytes instanceof Uint8Array
      ? options.logoBytes
      : new Uint8Array(options.logoBytes)
  }
  if (options?.logoLoader) {
    const loaded = await options.logoLoader()
    if (loaded == null) return null
    return loaded instanceof Uint8Array ? loaded : new Uint8Array(loaded)
  }
  if (typeof fetch !== 'function') return null
  try {
    const res = await fetch(PDF_LOGO_ASSET_PATH)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Pure logo-embed plan for Deno AC2 contracts (jsPDF addImage is browser-gated).
 * Both patient and SOAP call this with the same shared chrome rules.
 */
export function planPdfLogoEmbed(
  logoBytes: Uint8Array | null | undefined,
  kind: LibertyMdPdfDocKind,
): { logoEmbedded: boolean; kind: LibertyMdPdfDocKind; maxHeightPt: number } {
  const ok = Boolean(logoBytes && logoBytes.byteLength > 0)
  return {
    logoEmbedded: ok,
    kind,
    maxHeightPt: PDF_LOGO_MAX_HEIGHT_PT,
  }
}

/**
 * Serialize a structured doc to PDF Blob bytes via jsPDF (dynamic import).
 * Call from a user gesture. Never upload the Blob to Storage / proxy.
 *
 * P2-16: first-page color-mark logo + shared template chrome; omit logo on load
 * failure (still emit PDF). Helvetica only. Client-side only.
 */
export async function renderPdfBlob(
  doc: LibertyMdPdfDoc,
  options?: LibertyMdPdfRenderOptions,
): Promise<Blob> {
  const mod = await import('jspdf')
  const JsPDF = mod.jsPDF
  const pdf = new JsPDF({ unit: 'pt', format: 'letter' })
  const margin = PDF_MARGIN_PT
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const maxWidth = pageWidth - margin * 2
  const bottomLimit = pageHeight - margin
  let y = margin
  let pageIndex = 1
  let logoEmbedded = false

  const drawRunningChrome = () => {
    // Light running chrome only — wordmark + thin rule; no large logo repeat (Q2).
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(PDF_TYPE_PT.running)
    pdf.setTextColor(PDF_CHROME_COLORS.legal)
    pdf.text(PDF_RUNNING_WORDMARK, margin, margin - 16)
    pdf.setDrawColor(PDF_CHROME_COLORS.rule)
    pdf.setLineWidth(0.5)
    pdf.line(margin, margin - 10, pageWidth - margin, margin - 10)
    pdf.setFontSize(PDF_TYPE_PT.running)
    pdf.text(String(pageIndex), pageWidth - margin, margin - 16, { align: 'right' })
    pdf.setTextColor(PDF_CHROME_COLORS.ink)
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      pdf.addPage()
      pageIndex += 1
      drawRunningChrome()
      y = margin
    }
  }

  const writeWrapped = (
    text: string,
    fontSize: number,
    style: 'normal' | 'bold' = 'normal',
    color: string = PDF_CHROME_COLORS.ink,
  ) => {
    pdf.setFont('helvetica', style)
    pdf.setFontSize(fontSize)
    pdf.setTextColor(color)
    const lines = pdf.splitTextToSize(text, maxWidth) as string[]
    for (const line of lines) {
      ensureSpace(fontSize + 4)
      pdf.text(line, margin, y)
      y += fontSize + 4
    }
    pdf.setTextColor(PDF_CHROME_COLORS.ink)
  }

  // —— Page 1 brand band: logo (left) + title ——
  const logoBytes = await resolvePdfLogoBytes(options)
  const logoMaxH = Math.min(
    PDF_LOGO_MAX_HEIGHT_PT,
    pageHeight * PDF_LOGO_MAX_FIRST_PAGE_FRACTION,
  )

  if (logoBytes && logoBytes.byteLength > 0) {
    try {
      const props = pdf.getImageProperties(logoBytes)
      const aspect = props.width / Math.max(1, props.height)
      const drawH = logoMaxH
      const drawW = drawH * aspect
      pdf.addImage(logoBytes, 'PNG', margin, y, drawW, drawH)
      logoEmbedded = true
      // Title to the right of the mark when space allows; else below.
      const titleX = margin + drawW + 12
      const titleMaxW = pageWidth - margin - titleX
      if (titleMaxW >= 120) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(PDF_TYPE_PT.title)
        pdf.setTextColor(PDF_CHROME_COLORS.accent)
        const titleLines = pdf.splitTextToSize(doc.title, titleMaxW) as string[]
        let titleY = y + Math.min(drawH, PDF_TYPE_PT.title + 2)
        for (const line of titleLines) {
          pdf.text(line, titleX, titleY)
          titleY += PDF_TYPE_PT.title + 2
        }
        y = Math.max(y + drawH, titleY) + 8
      } else {
        y += drawH + 8
        writeWrapped(doc.title, PDF_TYPE_PT.title, 'bold', PDF_CHROME_COLORS.accent)
      }
    } catch {
      logoEmbedded = false
      writeWrapped(doc.title, PDF_TYPE_PT.title, 'bold', PDF_CHROME_COLORS.accent)
    }
  } else {
    writeWrapped(doc.title, PDF_TYPE_PT.title, 'bold', PDF_CHROME_COLORS.accent)
  }

  options?.onLogoEmbed?.({ logoEmbedded, kind: doc.kind })

  // Accent hairline under brand band
  pdf.setDrawColor(PDF_CHROME_COLORS.accent)
  pdf.setLineWidth(1)
  pdf.line(margin, y, pageWidth - margin, y)
  y += 10

  // Legal / label tier — smaller type, slate token, not a WARNING banner (Q6).
  // Meaning retained: AI-generated / not a diagnosis + no licensed clinician. No HIPAA.
  for (const header of doc.headerLines) {
    writeWrapped(header, PDF_TYPE_PT.legal, 'normal', PDF_CHROME_COLORS.legal)
  }
  pdf.setDrawColor(PDF_CHROME_COLORS.rule)
  pdf.setLineWidth(0.5)
  ensureSpace(8)
  pdf.line(margin, y, pageWidth - margin, y)
  y += 12

  for (const section of doc.sections) {
    y += 4
    writeWrapped(section.heading, PDF_TYPE_PT.section, 'bold', PDF_CHROME_COLORS.section)
    y += 2
    for (const line of section.bodyLines) {
      writeWrapped(line, PDF_TYPE_PT.body, 'normal', PDF_CHROME_COLORS.ink)
    }
  }

  return pdf.output('blob')
}

/**
 * Mobile-safe obtain path (AC6): Blob URL + temporary `<a download>` click.
 * Caller must revoke object URLs when done. Prefer calling inside a user gesture.
 * For multi-file "Both", download at most one file programmatically; surface the
 * rest as ready links / second-tap controls (never silent dual `a.click()`).
 */
export function triggerPdfDownload(blob: Blob, filename: string): string {
  const objectUrl = URL.createObjectURL(blob)
  if (typeof document === 'undefined') return objectUrl
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  return objectUrl
}

export function revokePdfObjectUrl(url: string | null | undefined): void {
  if (!url) return
  try {
    URL.revokeObjectURL(url)
  } catch {
    // best-effort
  }
}
