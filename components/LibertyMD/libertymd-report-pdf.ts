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
  LibertyMdPatientInfo,
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
    sessionSummary: string
    patientSummary: string
    triage: string
    nextStep: string
    differential: string
    assessmentAndPlan: string
    redFlags: string
    soap: string
    plan: string
    selfCare: string
    clinicalAssessment: string
    investigations: string
    aboutCondition: string
    whyConsidered: string
    soapSubjective: string
    soapObjective: string
    soapAssessment: string
    soapPlan: string
  }
  ordinal: {
    high: string
    medium: string
    low: string
    minimal: string
  }
  serious: string
  meta: {
    patientName: string
    gender: string
    age: string
    date: string
    anonymous: string
    notSpecified: string
    page: string
    footer: string
  }
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
  patientInfo?: LibertyMdPatientInfo
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

  // 1. Session Summary
  if (report.headline) {
    pushSection(sections, copy.sections.sessionSummary, [report.headline])
  }

  // 2. Patient Summary
  if (report.patientSummary) {
    pushSection(sections, copy.sections.patientSummary, [report.patientSummary])
  }

  // 3. Differential Diagnosis (NO numeric percentage scores!)
  if (report.differentials.length > 0) {
    const lines: string[] = []
    for (const item of report.differentials) {
      const bits: string[] = [item.name]
      if (item.ordinal) {
        const rawLabel = (copy.ordinal[item.ordinal] || item.ordinal).replace(/\s*\(\d+%\)/g, '').replace(/\s*\d+%/g, '').trim()
        const formattedBand = rawLabel.replace(/^./, (c) => c.toUpperCase())
        bits.push(item.isSerious ? `${formattedBand} · ${copy.serious}` : formattedBand)
      } else if (item.isSerious) {
        bits.push(copy.serious)
      }
      // Prefix disease name lines with '**' so the renderer bolds them
      lines.push(`**${bits.join(' — ')}**`)
      if (item.description) {
        lines.push(`**${copy.sections.aboutCondition}:**`)
        lines.push(item.description)
      }
      if (item.reason) {
        lines.push(`**${copy.sections.whyConsidered}:**`)
        lines.push(item.reason)
      }
    }
    pushSection(sections, copy.sections.differential, lines)
  }

  // 4. Recommended Action Plan
  if (report.assessmentAndPlan) {
    const lines: string[] = []
    if (report.assessmentAndPlan.assessment) {
      lines.push(`**${copy.sections.clinicalAssessment}:**`)
      lines.push(report.assessmentAndPlan.assessment)
    }
    if (report.assessmentAndPlan.plan.length) {
      lines.push(`**${copy.sections.plan}:**`)
      for (const item of report.assessmentAndPlan.plan) lines.push(`• ${item}`)
    }
    if (report.assessmentAndPlan.selfCare.length) {
      lines.push(`**${copy.sections.selfCare}:**`)
      for (const item of report.assessmentAndPlan.selfCare) lines.push(`• ${item}`)
    }
    if (report.assessmentAndPlan.diagnosticInvestigations.length) {
      lines.push(`**${copy.sections.investigations}:**`)
      for (const item of report.assessmentAndPlan.diagnosticInvestigations) lines.push(`• ${item}`)
    }
    pushSection(sections, copy.sections.assessmentAndPlan, lines)
  }

  // 5. Red Flags
  if (report.redFlags.length > 0) {
    pushSection(
      sections,
      copy.sections.redFlags,
      report.redFlags.map((flag) => `• ${flag}`),
    )
  }

  // 6. SOAP Note
  if (
    report.soap &&
    (report.soap.subjective || report.soap.objective || report.soap.assessment || report.soap.plan)
  ) {
    const lines: string[] = []
    if (report.soap.subjective) {
      lines.push(`**${copy.sections.soapSubjective}**`)
      lines.push(report.soap.subjective)
    }
    if (report.soap.objective) {
      lines.push(`**${copy.sections.soapObjective}**`)
      lines.push(report.soap.objective)
    }
    if (report.soap.assessment) {
      lines.push(`**${copy.sections.soapAssessment}**`)
      lines.push(report.soap.assessment)
    }
    if (report.soap.plan) {
      lines.push(`**${copy.sections.soapPlan}**`)
      lines.push(report.soap.plan)
    }
    pushSection(sections, copy.sections.soap, lines)
  }

  return {
    kind: 'patient',
    filename: buildPdfFilename('patient', when),
    title: copy.patientTitle,
    patientInfo: report.patientInfo,
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
    patientInfo: report.patientInfo,
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

export const PDF_WATERMARK_ASSET_PATH = '/images/asclepius-watermark.png'
export const PDF_DEVANAGARI_FONT_ASSET_PATH = '/fonts/NotoSansDevanagari.ttf'

function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097f]/u.test(text)
}

async function resolvePdfDevanagariFontBytes(): Promise<Uint8Array | null> {
  if (typeof fetch !== 'function') return null
  try {
    const res = await fetch(PDF_DEVANAGARI_FONT_ASSET_PATH)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export async function resolvePdfWatermarkBytes(): Promise<Uint8Array | null> {
  if (typeof fetch !== 'function') return null
  try {
    const res = await fetch(PDF_WATERMARK_ASSET_PATH)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
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
  const pdf = new JsPDF({ unit: 'pt', format: 'letter', compress: true })
  const margin = PDF_MARGIN_PT
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const maxWidth = pageWidth - margin * 2
  const bottomLimit = pageHeight - margin
  let y = margin
  let pageIndex = 1
  let logoEmbedded = false

  const [watermarkBytes, devanagariFontBytes] = await Promise.all([
    resolvePdfWatermarkBytes(),
    containsDevanagari(flattenPdfDocText(doc)) ? resolvePdfDevanagariFontBytes() : Promise.resolve(null),
  ])
  let fontFamily = 'helvetica'
  if (devanagariFontBytes?.byteLength) {
    try {
      const fontFile = 'NotoSansDevanagari.ttf'
      pdf.addFileToVFS(fontFile, bytesToBase64(devanagariFontBytes))
      pdf.addFont(fontFile, 'NotoSansDevanagari', 'normal')
      pdf.addFont(fontFile, 'NotoSansDevanagari', 'bold')
      fontFamily = 'NotoSansDevanagari'
    } catch {
      fontFamily = 'helvetica'
    }
  }

  const drawPageBackground = () => {
    // Subtle background tint (single rect for minimal PDF payload size)
    pdf.setFillColor(248, 250, 252)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Top brand accent rule
    pdf.setFillColor(37, 99, 235)
    pdf.rect(0, 0, pageWidth, 4, 'F')

    // Rod of Asclepius Watermark
    if (watermarkBytes && watermarkBytes.byteLength > 0) {
      try {
        const GStateConstructor = (pdf as unknown as { GState: new (options: { opacity: number }) => unknown }).GState
        pdf.setGState(new GStateConstructor({ opacity: 0.05 }))
        const wmHeight = 420
        const wmWidth = 336
        pdf.addImage(
          watermarkBytes,
          'PNG',
          (pageWidth - wmWidth) / 2,
          (pageHeight - wmHeight) / 2 + 10,
          wmWidth,
          wmHeight,
          undefined,
          'FAST',
        )
        pdf.setGState(new GStateConstructor({ opacity: 1.0 }))
      } catch {
        // ignore
      }
    }
  }

  // Draw Page 1 background hue + watermark
  drawPageBackground()

  const drawRunningChrome = () => {
    // Light running chrome — wordmark + page number + bottom disclaimer footer
    pdf.setFont(fontFamily, 'normal')
    pdf.setFontSize(PDF_TYPE_PT.running)
    pdf.setTextColor(PDF_CHROME_COLORS.legal)
    pdf.text(PDF_RUNNING_WORDMARK, margin, margin - 16)
    pdf.setDrawColor(PDF_CHROME_COLORS.rule)
    pdf.setLineWidth(0.5)
    pdf.line(margin, margin - 10, pageWidth - margin, margin - 10)
    pdf.text(`${copy.meta.page} ${pageIndex}`, pageWidth - margin, margin - 16, { align: 'right' })

    // Footer Disclaimer at bottom of page
    pdf.setDrawColor(PDF_CHROME_COLORS.rule)
    pdf.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28)
    pdf.text(
      copy.meta.footer,
      margin,
      pageHeight - 16,
    )
    pdf.setTextColor(PDF_CHROME_COLORS.ink)
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      pdf.addPage()
      pageIndex += 1
      drawPageBackground()
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
    pdf.setFont(fontFamily, style)
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

  /**
   * Renders a line that starts with a bold label before a colon:
   *   "Patient Symptoms: High fever, cough..."
   * The label portion is drawn bold, the value portion in normal weight.
   * Falls back to writeWrapped if no colon pattern is found.
   */
  const writeInlineLabeled = (text: string, fontSize: number) => {
    const colonMatch = text.match(/^(\*\*.*?\*\*|[A-Za-z0-9\s()/_-]+:)(.*)$/)
    if (!colonMatch) {
      writeWrapped(text, fontSize, 'normal', PDF_CHROME_COLORS.ink)
      return
    }
    const labelRaw = colonMatch[1].replace(/^\*\*|\*\*$|:$/g, '').trim().replace(/^Primary Differential$/i, 'Primary Diagnosis')
    const valueText = colonMatch[2].replace(/^:\s*/, ' ')
    const labelStr = labelRaw + ':'
    // Measure label width so we can place value inline
    pdf.setFont(fontFamily, 'bold')
    pdf.setFontSize(fontSize)
    const labelW = pdf.getTextWidth(labelStr) + 3
    // Write label bold
    ensureSpace(fontSize + 4)
    pdf.setTextColor(PDF_CHROME_COLORS.ink)
    pdf.text(labelStr, margin, y)
    // Write remaining value normal — wrap within remaining width
    pdf.setFont(fontFamily, 'normal')
    const valueLines = pdf.splitTextToSize(valueText.trim(), maxWidth - labelW) as string[]
    pdf.text(valueLines[0] ?? '', margin + labelW, y)
    y += fontSize + 4
    // Continuation lines for wrapped value
    for (let vi = 1; vi < valueLines.length; vi++) {
      ensureSpace(fontSize + 4)
      pdf.text(valueLines[vi], margin + labelW, y)
      y += fontSize + 4
    }
    pdf.setTextColor(PDF_CHROME_COLORS.ink)
  }

  // —— Page 1 Header Banner (Solid Blue Box with Logo & Physician Ready Report Title) ——
  const logoBytes = await resolvePdfLogoBytes(options)
  const bannerHeight = 78

  // Draw blue header rectangle (#3B71CA = RGB 59, 113, 202)
  pdf.setFillColor(59, 113, 202)
  pdf.rect(margin, y, maxWidth, bannerHeight, 'F')

  // Top Left: Liberty MD & LibertyMD.ai
  pdf.setFont(fontFamily, 'bold')
  pdf.setFontSize(20)
  pdf.setTextColor(255, 255, 255)
  pdf.text('Liberty MD', margin + 14, y + 26)
  pdf.setFont(fontFamily, 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(230, 240, 255)
  pdf.text('LibertyMD.ai', margin + 14, y + 38)

  // Top Right: Logo Mark
  if (logoBytes && logoBytes.byteLength > 0) {
    try {
      const props = pdf.getImageProperties(logoBytes)
      const aspect = props.width / Math.max(1, props.height)
      const drawH = 34
      const drawW = drawH * aspect
      pdf.addImage(logoBytes, 'PNG', pageWidth - margin - drawW - 14, y + 10, drawW, drawH)
      logoEmbedded = true
    } catch {
      logoEmbedded = false
    }
  }

  // Bottom Center: localized physician-review report title
  pdf.setFont(fontFamily, 'bold')
  pdf.setFontSize(16)
  pdf.setTextColor(255, 255, 255)
  pdf.text(doc.title, margin + maxWidth / 2, y + 62, { align: 'center' })

  options?.onLogoEmbed?.({ logoEmbedded, kind: doc.kind })
  y += bannerHeight + 12

  // —— Patient Metadata Block ——
  pdf.setDrawColor('#CBD5E1')
  pdf.setLineWidth(0.5)
  pdf.line(margin, y, pageWidth - margin, y)
  y += 12

  const nameStr = doc.patientInfo?.name || copy.meta.anonymous
  const ageStr = doc.patientInfo?.age ? String(doc.patientInfo.age) : copy.meta.notSpecified
  const rawSexStr = doc.patientInfo?.sexAtBirth
  const sexStr = rawSexStr ? rawSexStr.split('_').join(' ').replace(/^./, (c: string) => c.toUpperCase()) : copy.meta.notSpecified
  const dateStr = doc.patientInfo?.date || formatPdfUtcDate()

  // Row 1: Name (Left), Date (Right)
  pdf.setFont(fontFamily, 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor('#475569')
  pdf.text(copy.meta.patientName, margin + 4, y)
  pdf.setFont(fontFamily, 'normal')
  pdf.setTextColor('#111827')
  pdf.text(nameStr, margin + 92, y)

  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor('#475569')
  pdf.text(`${copy.meta.date}  ${dateStr}`, pageWidth - margin - 4, y, { align: 'right' })
  y += 14

  // Row 2: Gender & Age (Left)
  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor('#475569')
  pdf.text(copy.meta.gender, margin + 4, y)
  pdf.setFont(fontFamily, 'normal')
  pdf.setTextColor('#111827')
  pdf.text(sexStr, margin + 54, y)

  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor('#475569')
  pdf.text(copy.meta.age, margin + 140, y)
  pdf.setFont(fontFamily, 'normal')
  pdf.setTextColor('#111827')
  pdf.text(ageStr, margin + 168, y)
  y += 12

  // Hairline bottom rule
  pdf.setDrawColor('#CBD5E1')
  pdf.setLineWidth(0.5)
  pdf.line(margin, y, pageWidth - margin, y)

  // Constant 18pt section spacing
  const SECTION_SPACING_PT = 18

  for (let i = 0; i < doc.sections.length; i++) {
    const section = doc.sections[i]
    y += SECTION_SPACING_PT
    ensureSpace(PDF_TYPE_PT.section + 14)
    writeWrapped(section.heading, PDF_TYPE_PT.section, 'bold', PDF_CHROME_COLORS.section)
    y += 4
    for (const line of section.bodyLines) {
      // Lines wrapped in ** are fully bold (disease names, subsection labels)
      const boldMatch = line.match(/^\*\*(.*?)\*\*$/)
      if (boldMatch) {
        writeWrapped(boldMatch[1], PDF_TYPE_PT.body, 'bold', PDF_CHROME_COLORS.ink)
      } else {
        // Use inline labeling so "Label: value" lines bold just the label part
        writeInlineLabeled(line, PDF_TYPE_PT.body)
      }
    }
  }

  // Draw running footer on page 1
  drawRunningChrome()

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
