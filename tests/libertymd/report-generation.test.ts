/** Regression coverage for signed-in report loading and asynchronous recovery. */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

const ROOT = new URL('../../', import.meta.url)

Deno.test('REPORT-02 · acted-on diagnosis declares its n8n stage before transport', async () => {
  const source = await Deno.readTextFile(new URL('supabase/functions/libertymd-care-proxy/lib/n8n-client.ts', ROOT))
  const declaration = source.indexOf("const stage: N8nStage | null = speculative ? null : 'diagnosis'")
  const transport = source.indexOf('N8N_TIMEOUT_MS.diagnosis, stage')
  assert(declaration >= 0 && declaration < transport, 'diagnosis stage must be declared before postJson')
})

Deno.test('REPORT-03 · guest gate requires confirmed anonymous identity', async () => {
  const page = await Deno.readTextFile(new URL('components/LibertyMD/LibertyMDReportPage.tsx', ROOT))
  assert(page.includes("type IdentityStatus = 'loading' | 'anonymous' | 'linked'"), 'tri-state identity required')
  assert(page.includes("const isAnonymous = identityStatus === 'anonymous'"), 'null session must not mean anonymous')
  assert(/const showGate = isAnonymous\s*&& isReportGateOpen/.test(page), 'soft gate requires confirmed anonymous state')
  assert(page.includes("&& state.kind === 'ready'"), 'soft gate must not block report generation')
  assert(page.includes("typeof data?.is_anonymous === 'boolean'"), 'server identity must override hydration timing')
})

Deno.test('REPORT-04 · loader invokes generation, not report release', async () => {
  const page = await Deno.readTextFile(new URL('components/LibertyMD/LibertyMDReportPage.tsx', ROOT))
  const start = page.indexOf('const requestReportGeneration')
  const end = page.indexOf('useEffect(() => {', start)
  const recovery = page.slice(start, end)
  assert(recovery.includes("action: 'generate_report'"), 'loader must call report generation')
  assert(!recovery.includes("action: 'release_report'"), 'loader must not pretend release is generation')
})

Deno.test('REPORT-05 · generation is lease-protected and report-idempotent', async () => {
  const action = await Deno.readTextFile(new URL('supabase/functions/libertymd-care-proxy/actions/generate-report.ts', ROOT))
  const reads = await Deno.readTextFile(new URL('supabase/functions/libertymd-care-proxy/actions/reads.ts', ROOT))
  const index = await Deno.readTextFile(new URL('supabase/functions/libertymd-care-proxy/index.ts', ROOT))
  assert(action.includes('libertymd_claim_consultation_request'), 'generation must claim consultation lease')
  assert(action.includes('libertymd_finish_consultation_request'), 'generation must release consultation lease')
  assert(action.includes('ensureReportInserted'), 'report body must remain insert-once')
  assert(index.includes("['generate_report', handleGenerateReport]"), 'generation action must be dispatched')
  assert(reads.includes('is_anonymous: ctx.isAnonymous'), 'report read must return JWT-derived identity')
})

Deno.test('REPORT-06 · diagnosis workflow has structured parsers and strict complete report validation', async () => {
  const raw = await Deno.readTextFile(new URL('../n8n-workflows/definitions/libertymd-diagnosis-workflow__vljapWQv5ug7pFA9.json', ROOT))
  const workflow = JSON.parse(raw) as { nodes: Array<{ name: string; parameters?: Record<string, unknown> }> }
  const names = new Set(workflow.nodes.map((node) => node.name))
  assert(names.has('Differential Parser'), 'differential structured parser required')
  assert(names.has('Report Parser'), 'report structured parser required')
  const validator = workflow.nodes.find((node) => node.name === 'Validate Report')
  const code = String(validator?.parameters?.jsCode || '')
  assert(code.includes('report_sections_complete'), 'validator must require report sections')
  assert(code.includes('differentials.length === 3'), 'validator must require exactly three differentials')
})
