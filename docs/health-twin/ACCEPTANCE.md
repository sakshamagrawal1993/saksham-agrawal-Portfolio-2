# Health Twin acceptance contract

Status values are `PASS`, `FAIL`, `BLOCKED`, and `NOT_TESTED`. Only `PASS`
counts toward completion.

## Authentication and twin lifecycle

- **HT-001** Unauthenticated users are redirected to login.
- **HT-002** Authenticated users can create a twin.
- **HT-003** Users can select and reopen their twins.
- **HT-004** Users cannot access another user's private twin.
- **HT-005** Featured twins are visible according to RLS policy.

## Profile

- **HT-010** Users can save and update personal details.
- **HT-011** Valid height and weight create a BMI reading.
- **HT-012** Profile data survives reload.

## Manual health data

- **HT-020** Users can add individual laboratory parameters.
- **HT-021** Users can add vitals and symptoms.
- **HT-022** Users can add grouped blood-pressure readings.
- **HT-023** Users can add grouped sleep, exercise, and meal readings.
- **HT-024** New readings update relevant scores and charts.

## Wearables

- **HT-030** A valid wearable CSV shows a preview.
- **HT-031** Valid wearable rows are persisted.
- **HT-032** Invalid CSV input produces a useful error.
- **HT-033** Imported wearable data survives reload.

## Lab-report processing

- **HT-040** Supported reports upload to `health_documents`.
- **HT-041** Upload creates a `health_sources` processing record.
- **HT-042** `process-lab-report` invokes the configured n8n workflow securely.
- **HT-043** All documented n8n response wrappers are normalized.
- **HT-044** Extracted biomarkers are persisted.
- **HT-045** Processing failures mark the source failed with an error.
- **HT-046** Re-uploading a document does not corrupt existing data.

## Scores and visualizations

- **HT-050** Parameter definitions and ranges load.
- **HT-051** Scores are calculated from current data.
- **HT-052** Overall and category scores render.
- **HT-053** Charts render for available health categories.
- **HT-054** Editable readings can be updated and persisted.
- **HT-055** Deleting an editable reading updates UI and persistence.

## Health assistant

- **HT-060** Sending a message creates or reuses a chat session.
- **HT-061** User and assistant messages are persisted.
- **HT-062** Requests contain the correct twin and profile context.
- **HT-063** Supported agent response wrappers are normalized.
- **HT-064** Service failure produces a safe user-visible error.
- **HT-065** Conversation context does not leak between twins or users.

## Wellness

- **HT-070** Valid cached programs load without regeneration.
- **HT-071** Missing programs trigger generation.
- **HT-072** Refresh regenerates programs.
- **HT-073** Generation failure does not crash the dashboard.

## Playground

- **HT-080** Playground initializes from the active twin's real data.
- **HT-081** Parameter changes recalculate simulated scores.
- **HT-082** Reset restores the baseline.
- **HT-083** Simulation never mutates real health data.
- **HT-084** Simulated inputs update wellness guidance.
- **HT-085** Save Scenario either persists and reloads a scenario or is not presented as a working action.

## Security and reliability

- **HT-090** RLS prevents cross-user reads and writes of private data.
- **HT-091** Storage objects are owner-scoped.
- **HT-092** Edge-function secrets never reach the browser bundle.
- **HT-093** Production build passes.
- **HT-094** Tested flows produce no unexpected browser console or network errors.
- **HT-095** Publication occurs only after completion and never performs a GitHub push, PR creation, merge, or implicit GitHub publication.

## Evidence rules

- UI criteria require a browser test and screenshot or recording.
- Persistence criteria require a database/API assertion after reload.
- RLS criteria require two distinct authenticated users.
- Edge-function criteria require HTTP contract evidence and, when credentials
  are configured, a live staging invocation.
- `BLOCKED` or missing external credentials never becomes `PASS`.
