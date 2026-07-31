import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schemaDir = path.join(root, 'schemas', 'libertymd', 'n8n')
const fixtureDir = path.join(root, 'tests', 'libertymd', 'contracts')
const schemaFiles = {
  guardrail: 'guardrail-response.schema.json',
  interview: 'interview-response.schema.json',
  diagnosis: 'diagnosis-response.schema.json',
}

const ajv = new Ajv({ allErrors: true, strict: true })
addFormats(ajv)

const validators = {}
for (const [name, file] of Object.entries(schemaFiles)) {
  const schema = JSON.parse(await fs.readFile(path.join(schemaDir, file), 'utf8'))
  validators[name] = ajv.compile(schema)
}

const fixtureFiles = (await fs.readdir(fixtureDir)).filter((file) => file.endsWith('.json')).sort()
const results = []

for (const file of fixtureFiles) {
  const schemaName = file.split('-')[0]
  const validator = validators[schemaName]
  if (!validator) throw new Error(`No schema registered for fixture ${file}`)
  const fixture = JSON.parse(await fs.readFile(path.join(fixtureDir, file), 'utf8'))
  const actualValid = validator(fixture)
  const expectedValid = file.endsWith('.valid.json')
  results.push({
    file,
    schema: schemaName,
    expectedValid,
    actualValid,
    errors: actualValid ? [] : validator.errors,
  })
}

// L0-1 (2026-07-30): this previously resolved to null whenever the flag was absent,
// so the npm script validated ZERO workflows and exited 0 -- a green light wired to
// nothing, which hid a real assertion failure. Resolution order is now
// flag -> env -> conventional sibling path, and an unresolvable path is a HARD FAIL.
const definitionsArg = process.argv.find((arg) => arg.startsWith('--definitions-dir='))
const definitionsDir = path.resolve(
  definitionsArg?.split('=')[1]
  ?? process.env.LIBERTYMD_N8N_DEFINITIONS_DIR
  ?? path.join(root, '..', 'n8n-workflows', 'definitions'),
)
const allowMissingDefinitions = process.argv.includes('--allow-missing-definitions')

try {
  await fs.access(definitionsDir)
} catch {
  const message = `n8n definitions directory not found: ${definitionsDir}\n`
    + 'Pass --definitions-dir=<path>, set LIBERTYMD_N8N_DEFINITIONS_DIR, or place the\n'
    + 'n8n-workflows repo beside this one. Use --allow-missing-definitions only if you\n'
    + 'genuinely intend to skip workflow validation.'
  if (!allowMissingDefinitions) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.warn(`WARN: skipping workflow validation. ${message}`)
}

/**
 * Approved models for the LibertyMD clinical inference path.
 *
 * History of this assertion, because it has now been wrong twice:
 *  - Originally an exact match on 'models/gemini-3.1-flash-lite'. Workflows ran
 *    3.5-flash-lite, so it asserted FALSE on all three -- and nobody saw it,
 *    because the npm script never passed --definitions-dir (fixed in L0-1).
 *  - Then a gemini version floor. That went blind on 2026-07-30 when a deploy
 *    migrated all three workflows from lmChatGoogleGemini to lmChatOpenAi:
 *    'parameters.modelName' became 'parameters.model.value', so the extractor
 *    found nothing and reported an empty model list.
 *
 * Lesson encoded below: read every known parameter shape, and assert against an
 * explicit allow-list rather than a pattern. A pattern silently stops matching
 * when the schema moves; an allow-list plus a "found nothing" failure does not.
 *
 * Seeded with what is actually deployed. Changing the clinical model is a
 * deliberate decision -- add it here in the same change.
 */
const APPROVED_MODELS = new Set([
  'gpt-5.6-luna',                  // deployed 2026-07-30, all three workflows
  'models/gemini-3.5-flash-lite',  // previous; retained so a rollback still passes
])

/** Reads the model id across every node shape n8n has used for LLM nodes. */
function extractModel(node) {
  const p = node.parameters ?? {}
  // lmChatOpenAi (typeVersion >= 1.3): resource-locator object
  if (p.model && typeof p.model === 'object' && 'value' in p.model) return p.model.value
  // plain string form
  if (typeof p.model === 'string' && p.model) return p.model
  // lmChatGoogleGemini legacy
  if (typeof p.modelName === 'string' && p.modelName) return p.modelName
  return null
}

const workflowResults = []

const clinicalScenarioSchema = JSON.parse(await fs.readFile(
  path.join(root, 'schemas', 'libertymd', 'clinical-scenario-suite.schema.json'),
  'utf8',
))
const clinicalScenarioSuite = JSON.parse(await fs.readFile(
  path.join(root, 'tests', 'libertymd', 'clinical-scenarios.v0.1.json'),
  'utf8',
))
const validateClinicalScenarioSuite = ajv.compile(clinicalScenarioSchema)
const clinicalScenarioValid = validateClinicalScenarioSuite(clinicalScenarioSuite)

if (definitionsDir) {
  const expected = [
    ['guardrail', 'libertymd-guardrail-workflow__9qeE6tUcEY74OYV8.json'],
    ['interview', 'libertymd-interview-workflow__hqT6SFsmdRy1kWKa.json'],
    ['diagnosis', 'libertymd-diagnosis-workflow__vljapWQv5ug7pFA9.json'],
  ]
  for (const [name, file] of expected) {
    const workflow = JSON.parse(await fs.readFile(path.join(definitionsDir, file), 'utf8'))
    const llmNodes = workflow.nodes.filter((node) => String(node.type).includes('lmChat'))
    const models = [...new Set(llmNodes.map(extractModel).filter(Boolean))]
    // An LLM node whose model we cannot read is a blind spot, not a pass.
    const unreadableModelNodes = llmNodes
      .filter((node) => !extractModel(node))
      .map((node) => ({ name: node.name, type: node.type, typeVersion: node.typeVersion }))
    const settings = workflow.settings || {}
    workflowResults.push({
      workflow: name,
      active: workflow.active === true,
      models,
      llmNodeCount: llmNodes.length,
      unreadableModelNodes,
      correctModel: llmNodes.length > 0
        && unreadableModelNodes.length === 0
        && models.length > 0
        && models.every((model) => APPROVED_MODELS.has(model)),
      noPayloadRetention: settings.saveDataErrorExecution === 'none'
        && settings.saveDataSuccessExecution === 'none'
        && settings.saveManualExecutions === false
        && settings.saveExecutionProgress === false,
      timeout: settings.executionTimeout,
    })
  }
}

const fixtureFailures = results.filter((result) => result.actualValid !== result.expectedValid)
const workflowFailures = workflowResults.filter((result) => !result.active
  || !result.correctModel
  || !result.noPayloadRetention
  || result.timeout !== 60)

console.log(JSON.stringify({
  schemas: Object.keys(validators).length,
  fixtures: results.length,
  fixtureFailures,
  workflowsChecked: workflowResults.length,
  workflowResults,
  clinicalScenarioSuite: {
    scenarios: clinicalScenarioSuite.scenarios.length,
    valid: clinicalScenarioValid,
    errors: clinicalScenarioValid ? [] : validateClinicalScenarioSuite.errors,
  },
  passed: fixtureFailures.length === 0 && workflowFailures.length === 0 && clinicalScenarioValid,
}, null, 2))

if (fixtureFailures.length || workflowFailures.length || !clinicalScenarioValid) process.exit(1)
