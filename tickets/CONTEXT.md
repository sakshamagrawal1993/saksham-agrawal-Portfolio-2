# CONTEXT.md — the shared brief every role loads

**Read this first, in every phase, in every role.** It is durable product and architecture context, not per-ticket analysis.

**Rule about trust:** treat the register and spec documents as *inputs to verify*, never as findings to repeat. If a spec claims a number, re-run the query. Specs in this project have already been wrong — three tables they described did not exist, and a story was specced for a test suite that already existed.

---

## 1. What LibertyMD is

An **anonymous-first AI primary/urgent care consult**. An adult describes symptoms, gets emergency-aware triage, a focused clinical interview, and a doctor-ready report — then optionally saves it.

- Two clinical modes that must feel like one product: **mundane care** (calm intake → report) and **emergency care** (direct 911/ER guidance, no gate of any kind first).
- Positioning: free private AI doctor chat → doctor-ready report → human doctor.
- **A doctor network is committed and integrates before launch.** The handoff is a real product surface, not a fake door.
- **Approved pilot terms — copy may state these:** $39, availability within 30 minutes, full refund. These are LibertyMD's own terms, business-owner approved.
- **They are operational commitments, not marketing.** Each one has a supply side: $39 needs a payment path, "full refund" needs a refund path, "30 minutes" needs on-call coverage. Never ship the claim ahead of the mechanism that honours it — a promise the product cannot keep is worse than no promise.
- **HIPAA/BAA is deferred by business-owner decision** for the pilot. Do not add compliance work to tickets, and do not re-raise it. **But copy must not claim compliance that does not exist** — the privacy page may be silent on HIPAA; it may not assert attestation.

**Relationship to Dr. Jivi:** two separate products. LibertyMD is the more advanced version and **will be hived off**. Never couple them — no cross-product foreign keys, no shared edge functions, no shared n8n workflows.

## 2. What phase we are in, and why

**Product-market exploration**, not launch. The phase exists to answer one question: **is the doctor-ready report actually the product?**

This shapes every trade-off. When learning and conversion conflict, learning wins — save rate is optimisable later, the core question is answerable once.

Live funnel, measured, treat as ground truth for prioritisation:

| Stage | Reality |
|---|---|
| Stranded at demographics | **35% — confirmed real users** |
| Abandoned mid-interview | 37%, at an average of **2.3 turns** |
| Diagnosis eligibility floor | turn **6** — most users never reach it |
| Completed | **6%** |
| Diagnosis runs ever recorded | **1** |

## 3. Hard architectural rules

Violating any of these fails review, regardless of acceptance criteria.

1. **The frontend never writes clinical tables.** Only `functions.invoke('libertymd-care-proxy')`.
2. **The proxy is the sole clinical writer** (service role) — and the sole decision-maker about what gets persisted.
3. **n8n is stateless inference.** JSON in, JSON out, no database writes ever.
4. **Identity comes from the JWT.** Never trust a client-supplied user id.
5. **No PHI in telemetry, logs, client payloads, or error strings.** Numerics bucketed, never raw.
6. The home footer ribbon is frozen.

**Why rule 2 matters most:** the proxy receiving three independent inference results and deciding what to persist is what keeps failure domains separate. If Diagnosis fails, the Guardrail safety verdict has still landed. Any change that moves decisions into n8n couples the safety path to the diagnosis path — a safety regression, not a refactor.

## 4. Principles that shape acceptance criteria

- **Deterministic guards over prompt instructions.** Anything that must *never* happen belongs in code. "Never ask the same question twice", "stop at 15 turns", "no inference after emergency" are invariants, not instructions. Prompts are probabilistic.
- **Value before ask.** Every gate in this product historically asked before it gave. Age, sex and consent before one useful sentence; sign-in before the report. Fixing the order of asks and gives is most of the funnel work.
- **The user's input is sacred; the system's state is disposable.** Never lose what someone typed. Never make them retype something we already hold.
- **Never leak internals into the UI.** No native dialogs, no internal component names in user copy, no stale server state surfacing as a scary message.
- **A technical failure must never wear clinical clothing.** Four severities: info, caution, emergency, and *technical*. A server error dressed as a health caution has happened here and must not recur.
- **Safety asymmetry.** A false positive is an annoyed user; a false negative is a missed MI. Never reduce detection sensitivity to reduce interruptions — improve the interruption so sensitivity stays affordable.
- **Emergency guidance precedes everything.** No consent gate, no auth gate, no email gate, ever, in front of emergency instruction. And it must be in the viewport by construction, not by scroll.

## 5. Conventions

- **Telemetry:** every event prefixed `LibertyMd ` (sibling stack uses `DrJivi `) — the Mixpanel project is shared across six products, so the prefix is load-bearing. One `emitEvent()` helper in the proxy, one `track()` wrapper in the client. Never hand-type an event name.
- **Two sinks, one emit point:** `libertymd_product_events` (auditable, RLS'd) and Mixpanel (analysis). Postgres is the source of truth; Mixpanel loss is tolerable.
- **Clinical lifecycle events emit server-side** from the proxy. Client-side is for UI interaction only.
- Proxy actions are one handler each; keep them in their own modules.
- Report ordering is **triage → what to do now → differential → SOAP**, not the clinician's note order.
- Patient-facing confidence is **ordinal** ("Most likely", "Possible"). Numeric confidence appears only in the clinician section — a model's score is not a diagnostic probability.

## 6. Where the sources of truth live

| Thing | Path |
|---|---|
| Ticket specs, all phases | `LibertyMD/LibertyMD_Ticket_Specs_Phase0_Phase1.md` |
| Gap register + Mixpanel taxonomy | `LibertyMD/LibertyMD_Master_Register.md` |
| Journey gaps | `LibertyMD/LibertyMD_Customer_Journey_Redesign.md` |
| Competitive analysis | `LibertyMD/LibertyMD_vs_Doctronic_Competitive_Analysis.md` |
| Live architecture contract | `Projects/saksham-agrawal-Portfolio-2/docs/libertymd/CARE-ARCHITECTURE.md` |
| Proxy | `Projects/saksham-agrawal-Portfolio-2/supabase/functions/libertymd-care-proxy/` |
| n8n workflows | `Projects/n8n-workflows/definitions/libertymd-*.json` |
| Clinical scenario corpus (20) | `Projects/saksham-agrawal-Portfolio-2/tests/libertymd/clinical-scenarios.v0.1.json` |
| Test entrypoint | `npm run test:libertymd:ci` |
| Supabase project | `ralhkmpbslsdkwnqzqen` |

## 7. Known traps

- `libertymd-care-proxy` and `ai-care-proxy` are **different products**. Check which one a bug report actually concerns.
- `LibertyMDChat.tsx` has ~8 pre-existing TypeScript errors. The bar is **no new errors**, not a clean typecheck. See `BASELINE.md`.
- `test:libertymd:contracts` silently validates nothing unless `--definitions-dir=` is passed.
- There are **two** deterministic emergency screens — one in the edge function (`clinical-policy.ts`, narrow) and one in the n8n guardrail (five presentations, negation-aware). **They have drifted.** Check both.
- The i18n tables described in older docs do not exist.
