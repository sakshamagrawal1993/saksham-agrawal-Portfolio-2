# LibertyMD cohort boundaries (in-repo SoT for CI)

Ticket vault SoT for append-only decisions remains under Startups
`LibertyMD/tickets/DECISIONS.md`. This file mirrors the **funnel cohort**
entries that CI must assert without depending on the Obsidian vault.

## 2026-07-31 · P1-01 · Unified entry cohort boundary

**A:** **Deploy-timestamp + append-only annotation only** (no runtime flag). Cohort boundary date: **2026-07-31** (P1-01 ship day). Rollback = revert deploy / git.

## 2026-07-31 · P1-08 · Speculative diagnosis cohort boundary

**A:** **Deploy-timestamp + append-only annotation only** (no runtime flag). Cohort boundary date: **2026-07-31** (P1-08 QA PASS / ship day). Rollback = revert deploy / git / env.

**Query basis:** Events with props `was_speculative` and `served_from_cache`.

## 2026-07-31 · P2-14 · Diagnosis eligibility retune cohort boundary

**A:** **Deploy-timestamp + append-only annotation only** (no runtime flag). Cohort boundary date: **2026-07-31** (P2-14 ship day UTC).

**Query basis:**

- **Completion:** distinct `consultation_id` with product event `report_ready`, and/or consult `status ∈ {completed, report_pending_auth}`.
- **Report validity:** `diagnosis_attempted` with `properties.outcome = 'valid'`, and/or `libertymd_diagnostic_runs.run_status = 'validated'` with `is_speculative = false`.
