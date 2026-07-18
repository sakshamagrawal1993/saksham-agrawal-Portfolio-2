# LibertyMD n8n Host Retention Runbook

## Purpose

Confirm that n8n host configuration does not retain LibertyMD patient payloads beyond the minimum operational window. Workflow-level settings are already disabled; this runbook verifies defense in depth at the instance and database layers.

## Required Host Settings

Use the values supported by the deployed n8n version and confirm them in the running main and worker containers:

```dotenv
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
EXECUTIONS_DATA_SAVE_ON_ERROR=none
EXECUTIONS_DATA_SAVE_ON_PROGRESS=false
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=24
```

`EXECUTIONS_DATA_MAX_AGE` is in hours. A shorter value may be selected after confirming incident-response needs. Do not add raw request bodies to application logs, error logs, custom execution data, or external tracing.

## Read-Only Verification

1. Identify every n8n main and worker container.
2. Inspect environment variables without exporting secrets.
3. Confirm all three LibertyMD workflows have `saveDataSuccessExecution=none`, `saveDataErrorExecution=none`, `saveManualExecutions=false`, and `saveExecutionProgress=false`.
4. Query execution counts and oldest timestamps for the three LibertyMD workflow IDs.
5. Trigger one synthetic request containing no real patient data.
6. Confirm no saved execution payload is available after completion and again after the pruning window.
7. Inspect reverse-proxy, container, database, metrics, and tracing logs for request-body capture.
8. Record date, n8n version, container IDs, result, reviewer, and any corrective action.

## Workflow IDs

- Guardrail: `9qeE6tUcEY74OYV8`
- Interview: `hqT6SFsmdRy1kWKa`
- Diagnosis: `vljapWQv5ug7pFA9`

## Current Verification Gap

The workflow settings were verified through the n8n API. Read-only SSH to `72.61.231.160` failed with `Permission denied (publickey,password)`, so the instance environment, database age, reverse-proxy logs, and tracing configuration remain unverified.
