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

const definitionsArg = process.argv.find((arg) => arg.startsWith('--definitions-dir='))
const definitionsDir = definitionsArg ? path.resolve(definitionsArg.split('=')[1]) : null
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
      correctModel: models.length > 0 && models.every((model) => model === 'models/gemini-3.1-flash-lite'),
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
