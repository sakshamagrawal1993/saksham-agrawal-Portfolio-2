# Business Owner Decisions — LibertyMD

Append only. Never rewrite. Read this before writing any story; never escalate a question answered here.

---

## 2026-07-30 · Product structure
**Q:** Are Dr. Jivi and LibertyMD one product or two?
**A:** Two products. LibertyMD is the more advanced and polished version of Dr. Jivi. They remain separate for now; **LibertyMD will be hived off in future.**
**Implication:** LibertyMD must stay self-contained — no new FKs from `libertymd_*` to `jivi_*` or shared tables, no shared n8n workflows, no shared edge functions. Verified 2026-07-30: zero cross-schema FKs exist today. Keep it that way.

## 2026-07-30 · Consent
**Q:** Should the consent checkbox be pre-ticked?
**A:** **Yes, pre-ticked.** Cleared by the business owner's legal team. Do not re-litigate.
**Scope note:** placement stays in the same card as age/sex.

## 2026-07-30 · Demographics drop-off
**Q:** Are the 17 consults stranded at `awaiting_demographics` real users or internal test sessions?
**A:** **Real users.** The 35% entry wall is genuine, not a testing artifact. P1-01 is therefore the top funnel priority.

## 2026-07-30 · Profile age policy
**Q:** Restrict profiles to adults only?
**A:** **Yes.** Age < 18 rejected server-side at profile create and edit. Interview/diagnosis prompts and guardrail thresholds are adult-written; paediatric support requires separate clinical content.

## 2026-07-30 · Report gating
**Q:** Is the Phase-2 report ungated, or does it keep a gate?
**A:** **Soft gate.** Show the benefits of signing in, but **do not block** access to the report. Report content is fully visible; the login prompt is persuasive and dismissible, never a condition of viewing.

## 2026-07-30 · Analytics platform
**Q:** New Mixpanel project for LibertyMD, or reuse the existing one?
**A:** **Reuse** the existing `portfolio` project (id `3967298`).
**Implication:** the `LibertyMd ` event-name prefix is mandatory, not cosmetic — six products share that project. Sibling stack uses `DrJivi `.

## 2026-07-30 · Safety detection posture
**Q:** Remove the edge deterministic emergency screen?
**A:** **No — keep and expand it.** Evidence: 9/9 firings were true positives (identical textbook-ACS message), 0 false positives. It is the only emergency path independent of n8n, and n8n is the currently-failing component. The phantom alerts came from `high_risk_continue` styled as emergency plus `error_fail_cautious`, not from detection.
**Also decided:** do **not** raise the LLM guardrail confidence bar to 90% — it produced 1 force_end in 98 events, so the change would do nothing while trading cheap false positives for missed MIs.

## 2026-07-30 · Conversation interruption policy
**Q:** Keep the conversation free of interruptions until an emergency is detected with high confidence?
**A:** Yes — achieved by **decoupling detect / act / show**, not by reducing detection sensitivity. `high_risk_continue` renders nothing and instead raises red-flag question priority in the interview. Only `force_end` interrupts. "High confidence" means **corroboration** (deterministic hit, or LLM agreeing with red-flag slot evidence), never a self-reported model confidence number.

## 2026-07-30 · Doctor network
**Q:** Is there a doctor network, and does the handoff CTA promise real service?
**A:** **Yes — network is committed and integrates before launch.** The handoff is a real product surface, not a fake door.
**Implication:** H4 (demand by triage tier) is downgraded from a go/no-go on supply investment to a **staffing and routing** input. Gate D removed.

## 2026-07-30 · Pilot commercial terms
**Q:** What terms may the doctor CTA advertise?
**A:** **$39, availability within 30 minutes, full refund.** These are LibertyMD's own pilot terms — approved for use in copy.
**Note:** these are now *operational commitments*, not marketing. They require a payment path, a refund path, and on-call coverage sufficient to honour 30 minutes. See P2-15.

## 2026-07-30 · HIPAA posture
**Q:** Does the pilot need HIPAA/BAA infrastructure?
**A:** **Deferred by business-owner decision — "we are just running an experiment."** Do not add HIPAA/BAA work to any ticket in this phase, and do not re-raise it per ticket.
**Recorded for the record, once:** adding paid licensed clinicians is what changed here — a consumer symptom checker and a service that routes patient data to clinicians for a fee are different postures, and the status can attach by function rather than by scale or intent. The practical form this is most likely to take is **the network partner requiring a BAA before they will accept patient data** — a commercial gate, not a legal opinion. Flagged for the business owner's counsel; not an engineering task.
**Copy constraint that still holds:** the privacy page and consent copy must not *claim* HIPAA compliance or attestation while none exists. Silence is fine; overclaiming is not.

---

## Standing constraints (not re-decidable per ticket)

- Frontend never writes clinical tables — only via `libertymd-care-proxy`.
- The proxy is the sole clinical writer (service role).
- n8n is stateless inference — no DB writes.
- Identity comes from the JWT. Never trust a client-supplied user id.
- The home footer ribbon is frozen.
- No PHI in telemetry, logs, or client payloads. Numerics bucketed.
- `LibertyMDChat.tsx` has ~8 pre-existing TypeScript errors. DoD is **"no new TS errors"** against that baseline, not "typecheck clean".
