# LibertyMD — Product Requirements

**Authority:** this document is authoritative for **product intent and required user behaviour**. It is *not* authoritative for everything.

| Question | Authoritative source |
|---|---|
| Why are we building this? | **This PRD** |
| What user behaviour is required? | **This PRD** |
| What is in *this* ticket? | The approved `03-clarified.md` |
| Which architectural rules apply? | `tickets/CONTEXT.md` |
| What did the business owner decide? | `tickets/DECISIONS.md` — **overrides this PRD** |
| Is it done correctly? | Gate output + `05-qa-report.md` |

**Precedence when sources conflict:** latest `DECISIONS.md` entry → approved ticket contract → this PRD → design spec → repo conventions. **An agent that finds a conflict must stop and escalate, never silently pick a winner.**

---

## 1. What LibertyMD is

An **anonymous-first AI primary and urgent care consult.** An adult describes symptoms in free text, receives emergency-aware triage, a focused clinical interview, and a doctor-ready report — then optionally saves it or continues to a licensed doctor.

Two clinical modes that must feel like one product:

| Mode | Experience | System behaviour |
|---|---|---|
| **Mundane care** | Calm intake → home / telehealth / urgent report | Guardrail passes → slot-filling interview → diagnosis report |
| **Emergency care** | Direct 911/ER guidance, immediately, with no gate of any kind first | Guardrail `force_end` → terminal stop |

**Relationship to Dr. Jivi:** two separate products. LibertyMD is the more advanced version and **will be hived off**. Never couple them — no cross-product foreign keys, no shared edge functions, no shared n8n workflows.

## 2. The bet this phase tests

> A doctor-ready report, produced free and anonymously in under ten minutes, is valuable enough on its own that users finish the intake, keep the artifact, and ask for a human when the report tells them to.

**Phase goal: product-market exploration, not launch.** When learning and conversion conflict, learning wins — conversion is optimisable later, the core question is answerable once.

Measured reality, treat as ground truth for prioritisation:

| Stage | Reality |
|---|---|
| Stranded at demographics | **35% — confirmed real users** |
| Abandoned mid-interview | 37%, at an average of **2.3 turns** |
| Diagnosis eligibility floor | turn **6** — most users never reach it |
| Completed | **6%** |
| Diagnosis runs ever recorded | **1** |

## 3. Required user behaviour

### 3.1 Entry
- A user can start from free text with **no signup wall**.
- Age and sex are required before clinical questioning — they materially change safety thresholds.
- Consent (ToS, privacy, AI disclosure) is captured and audited. Checkbox is **pre-ticked** (business-owner decision, legal-approved).
- A user may hold multiple profiles. **Adults only, enforced server-side.** Anonymous identities get exactly one self profile; multi-profile requires login.

### 3.2 Interview
- Structured slot-filling, maximum 15 turns, target **6–10 turns to report**.
- **A question already answered must never be asked again.** This is an invariant enforced in code, not a prompt instruction.
- The user always knows roughly how much is left.
- Off-topic answers are redirected warmly, never punished.

### 3.3 Emergency
- Emergency guidance **precedes everything** — no consent gate, no auth gate, no email gate, ever.
- It must be **in the viewport by construction, not by scroll.**
- It is terminal: no further inference runs after `force_end`.
- Copy is condition-specific. A cardiac emergency does not show a mental-health crisis line.
- **A `force_end` from the proxy must reach the user on every path.** A server that terminates correctly while the client renders an interview question is a complete failure.

### 3.4 Report
- Ordered **triage answer → what to do now → differential → SOAP**. The customer's first question is "do I need to be seen, how fast", not "what are the candidate diagnoses".
- **Soft gate:** the full report is visible to every completing user. The login prompt is persuasive and dismissible, **never blocking**. If any section requires signing in, the requirement is not met.
- Patient-facing confidence is **ordinal** ("Most likely", "Possible"). Numeric confidence appears only in the clinician section — a model's score is not a diagnostic probability.
- Every clinical claim carries AI-generated / not-clinician-reviewed framing above the fold.

### 3.5 Doctor handoff
- A doctor network is committed and integrates before launch. The handoff is a real surface, not a fake door.
- **Approved pilot terms:** $39 · availability within 30 minutes · full refund.
- **These are operational commitments, not marketing.** A claim renders only when its mechanism is live: the price line requires a working payment path, the refund line a working refund path, the 30-minute line an availability signal. Never ship a promise ahead of what honours it.
- No mock scheduling, ever. A fake calendar teaches a user that care is available when it is not.

### 3.6 Continuity
- Saved consults are retrievable; reopening lands on the **report**, not the transcript.
- Anonymous data expires (7-day guest window) and the user is told so.
- Anonymous → login migration loses no clinical history.

## 4. Non-goals this phase

HIPAA/BAA posture (deferred by business-owner decision — but copy must never *claim* compliance that does not exist) · clinical sign-off · SEO content engine · true token streaming · public share links · under-18 profiles · i18n beyond English.

## 5. Failure modes ranked by cost

Every agent uses this order when hunting regressions:

1. **Emergency detection failing to fire, or emergency guidance not reaching the user.**
2. Sensitive data leaving its intended store.
3. Loss of user input.
4. A technical failure presented as a clinical warning — or a clinical warning presented as a mere app fault.
5. Repeating a question the user already answered.

**The safety asymmetry:** a false positive is an annoyed user; a false negative is a missed myocardial infarction. Never reduce detection sensitivity to reduce interruptions. Improve the interruption so sensitivity stays affordable.
