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

const MIN_MODEL = { major: 3, minor: 1, variant: 'flash-lite' }

// L0-2 (2026-07-30): was an exact match on 'models/gemini-3.1-flash-lite'. The
// workflows run 3.5-flash-lite, so this asserted FALSE on all three -- a stale
// assertion, not a model defect. A floor accepts newer models and still catches
// downgrades or a switch to an unapproved variant.
function modelMeetsFloor(model) {
  const parsed = /^models\/gemini-(\d+)\.(\d+)-(.+)$/.exec(String(model))
  if (!parsed) return false
  const [, major, minor, variant] = parsed
  if (variant !== MIN_MODEL.variant) return false
  const maj = Number(major)
  const min = Number(minor)
  return maj > MIN_MODEL.major || (maj === MIN_MODEL.major && min >= MIN_MODEL.minor)
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
    const models = [...new Set(workflow.nodes
      .map((node) => node.parameters?.modelName)
      .filter(Boolean))]
    const settings = workflow.settings || {}
    workflowResults.push({
      workflow: name,
      active: workflow.active === true,
      models,
      correctModel: models.length > 0 && models.every(modelMeetsFloor),
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
