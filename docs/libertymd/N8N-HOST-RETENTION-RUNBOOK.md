# LibertyMD n8n Host Retention Runbook

## Purpose

Keep LibertyMD workflow executions inspectable for incident response and product monitoring without retaining clinical payloads indefinitely. Completed, failed, and manual executions are saved for a rolling seven-day operational window. Intermediate progress snapshots remain disabled.

## Required Host Settings

Use the values supported by the deployed n8n version and confirm them in the running main and worker containers:

```dotenv
EXECUTIONS_DATA_SAVE_ON_SUCCESS=all
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=true
EXECUTIONS_DATA_SAVE_ON_PROGRESS=false
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=168
```

`EXECUTIONS_DATA_MAX_AGE` is in hours, so `168` retains seven days. The main and every worker must use the same values and be restarted after a host-level change.

Execution data contains patient-authored clinical text. Limit n8n execution access to authorized operators, do not export execution payloads into tickets or chat, and do not duplicate raw request bodies in application logs, error logs, custom execution data, or external tracing. Synthetic test payloads are preferred for routine investigation.

## Required Workflow Settings

Every LibertyMD workflow definition must explicitly set:

```json
{
  "saveDataSuccessExecution": "all",
  "saveDataErrorExecution": "all",
  "saveManualExecutions": true,
  "saveExecutionProgress": false
}
```

Explicit workflow settings prevent a future workflow-as-code synchronization from silently reverting to an instance default that hides execution data.

## Read-Only Verification

1. Identify every n8n main and worker container.
2. Inspect environment variables without exporting secrets.
3. Confirm every LibertyMD workflow has `saveDataSuccessExecution=all`, `saveDataErrorExecution=all`, `saveManualExecutions=true`, and `saveExecutionProgress=false`.
4. Query execution counts and oldest timestamps for the LibertyMD workflow IDs.
5. Trigger one successful and one intentionally failing synthetic request containing no real patient data.
6. Confirm both executions expose node-level data to an authorized operator.
7. Confirm executions older than seven days are pruned.
8. Inspect reverse-proxy, container, database, metrics, and tracing logs for duplicate request-body capture.
9. Record date, n8n version, container IDs, result, reviewer, and any corrective action.

## Workflow IDs

- Guardrail: `9qeE6tUcEY74OYV8`
- Interview: `hqT6SFsmdRy1kWKa`
- Mini Differential: `HfRcohhBalqrGll8`
- Diagnosis: `vljapWQv5ug7pFA9`
- Lab Analysis: `7DNhiWE3VKuNN0ZN`
- Photo Analysis: `ipEzpO7URC0me5aw`

## Current Verification Gap

Workflow settings can be verified and synchronized through the n8n API. Host environment, database-age pruning, reverse-proxy logs, and tracing configuration still require VPS-level verification after any deployment change.
