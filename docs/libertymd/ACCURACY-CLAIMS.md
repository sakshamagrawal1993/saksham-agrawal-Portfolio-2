# LibertyMD · Accuracy claims substantiation

**Ticket:** P3-04  
**Written:** 2026-07-31  
**Pulse / methodology re-fetch:** `retrieved 2026-07-31`  
**Authority:** `tickets/P3-04/03-clarified.md` · `tickets/DECISIONS.md` (two-product rule; Gate B; HIPAA deferred; P2-15 deferred; P3-01 paid scope) · `docs/libertymd/AD-PLATFORM-POLICY.md` §AC6  
**Scope:** LibertyMD acquisition / landing / paid-destination **numeric accuracy** claims only. Not clinical UI ordinal confidence. Not Dr. Jivi or Pulse product marketing.

---

## Verdict (dated)

**LibertyMD numeric accuracy claims = `no-ship`.**

- **Verdict date:** 2026-07-31  
- **Approved set size:** **0**  
- **Reason:** No LibertyMD-scoped benchmark with a durable public methodology URL is approved for ship. Candidate numbers from Dr. Jivi, Pulse dashboard chrome, and clinical-corpus engineering gates are **rejected / out of set**. Spec AC4 / Lane B preflight: if methodology cannot be published or described with a working link, **the number is not used**.

**Lane A export (binding):**

```
Mount none — no numeric accuracy claim.
```

**P3-03 honour:** trust band / hero trust strip mount none — no diagnostic % / Pulse / Jivi / corpus sens-spec on those surfaces.

Do **not** leave a “pending number” in approved copy. If a publishable LibertyMD-scoped methodology appears later → **follow-up ticket** (not a silent amend of this file’s approved set mid-flight).

---

## Approved claims

**None.**

AC1 methodology / dataset / author / URL fields are required only for **approved** claims. With an empty approved set, AC1 is satisfied by this dated **no-ship** inventory plus the Lane A “mount none” block above.

---

## Candidate inventory (all rejected / out of set)

| Candidate | Source surface | Status | Reason |
|---|---|---|---|
| **94.77%** (top-3 diagnostic accuracy / USMLE–NEJM framing) | Portfolio `constants.ts` / `api/ask-ai.ts` — **Dr. Jivi**-framed | **Rejected / out of LibertyMD set** | Wrong product. `DECISIONS.md` **2026-07-30 · Product structure**: LibertyMD and Dr. Jivi are separate; no transplant without same-product measurement **and** BO transfer affirmation. |
| **94.06% accuracy** (MedX card) | `https://pulse.jivi.ai/` homepage dashboard | **Rejected / out of LibertyMD set** | Jivi-branded Pulse dashboard chrome, not a methodology document; not LibertyMD-scoped. Methodology candidate routes **404** (`retrieved 2026-07-31`). AC4 → no-ship. |
| **99.6% F1 Score accuracy** (Mental Health card) | `https://pulse.jivi.ai/` homepage dashboard | **Rejected / out of LibertyMD set** | Same as above — dashboard marketing ≠ publishable methodology; wrong product brand; AC4 → no-ship. |
| Corpus **sensitivity 1.0 / specificity 1.0** (`engineeringRegressionPassed: true`, `clinicalReleaseGatePassed: false`) | `tickets/BASELINE.md` / `npm run test:libertymd:evaluation` | **Rejected as marketing accuracy source** | Engineering gate for emergency detection regression; **32** scenarios still `pendingClinicalReview`; clinical release targets not clinician-approved. Forbidden as patient-facing “diagnosis accuracy.” |

**Transfer rule:** Dr. Jivi portfolio percentages and Pulse dashboard figures are **not** LibertyMD claims by default. Transfer requires documented **LibertyMD-scoped** measurement + durable public methodology URL + BO affirmation. Until then they remain in this rejected inventory. Approved claims may **not** link to `pulse.jivi.ai` while measurement remains Jivi-branded without that transfer proof.

---

## Pulse re-fetch (`retrieved 2026-07-31`)

Implementer re-retrieved Pulse homepage and methodology candidates. PM 2026-07-31 spot-check is superseded by this stamp.

| URL | HTTP status | Notes |
|---|---:|---|
| `https://pulse.jivi.ai/` | **200** | Title/chrome: “Jivi Pulse” / Responsible Medical AI Dashboard. Visible cards include **MedX · 94.06% accuracy** and **Mental Health · 99.6% F1 Score accuracy**. Dashboard figures ≠ methodology. |
| `https://pulse.jivi.ai/methodology` | **404** | No public methodology page |
| `https://pulse.jivi.ai/about` | **404** | No public about/methods page |
| `https://pulse.jivi.ai/docs` | **404** | No public docs page |
| `https://pulse.jivi.ai/whitepaper` | **404** | Candidate whitepaper path absent |
| `https://pulse.jivi.ai/methods` | **404** | Candidate methods path absent |

**Conclusion:** No durable public methodology URL found. Measurement remains Jivi/Pulse-branded, not LibertyMD-scoped. **Keep `no-ship`** for all Pulse-adjacent numbers on LibertyMD surfaces.

---

## Dating + stale-removal rule (AC2)

1. Every **approved** numeric accuracy claim (if any are ever added by a follow-up ticket) **must** carry an explicit measurement or publication date and a live primary methodology URL.  
2. If a methodology link dies, returns non-document chrome, or a measurement is superseded, the claim is **removed from approved copy** and from any LibertyMD landing / marketing / paid-destination surface — **not** left to age as stale trust theatre.  
3. This **no-ship** verdict itself is dated (**2026-07-31** / Pulse `retrieved 2026-07-31`). Re-open only via a **new ticket** that re-fetches sources and either keeps no-ship or approves a fully scoped claim.

---

## Overclaim prohibition (AC3) — standing

Approved wording must **not** imply **diagnostic accuracy**, definitive diagnosis, or cure if the underlying benchmark measured something narrower (e.g. specialty-subset case accuracy, F1 on safety monitoring, USMLE-style exam score, emergency-detection sens/spec on a synthetic corpus).

With **zero** approved claims today, this rule still binds future tickets: scope the claim to what was measured, or do not ship a number.

---

## P3-01 AC6 constraints absorbed (P3-04 tags)

Binding on any future approved claim creative/copy and on the current **no-ship** posture (no approved claim may contradict these). Source: `docs/libertymd/AD-PLATFORM-POLICY.md` §AC6. Items **3, 5, 9, 10, 11, 14** are **not** this ticket’s feed.

| # | Constraint (verbatim-intent) |
|---|---|
| **1** | **AI not a clinician** — State that LibertyMD is an AI symptom-assessment / doctor-ready report tool, **not** a licensed physician and **not** a diagnosis substitute. |
| **2** | **Emergency asymmetry** — If symptoms may be emergency, seek emergency care (911/ER) immediately; do not wait on the AI consult. |
| **4** | **Prohibit HIPAA / compliance invent** — No “HIPAA compliant”, “HIPAA Safe Harbor”, “BAA”, or equivalent attestation in ads or paid landings while deferred. |
| **6** | **Prohibit bookable-care claims until live** — No `$39`, “within 30 minutes”, “full refund”, or “book a doctor now” until payment gateway + network mechanisms are live. |
| **7** | **Prohibit cure / certainty claims** — No cure/heal/eliminate language; no guaranteed diagnosis accuracy; no “definitive diagnosis”. |
| **8** | **Meta personal-attribute ban** — No creative that asserts the viewer has a condition (“Do you have…?”, “Your diabetes…”, “Depression getting you down?”). Prefer product-benefit framing. |
| **12** | **ES + EN parity** — Spanish and English creatives/landings carry the same disclaimers and prohibitions; Spanish is not a weaker lane. |
| **13** | **Adult / age gate where required** — TikTok (and Meta categories that require it): health-category ads **18+** when policy requires. |

Especially **AC6.7**: even if a future ticket approves a scoped benchmark percentage, it must **never** be worded as guaranteed diagnosis accuracy or a definitive diagnosis.

---

## Approved copy for Lane A

```
Mount none — no numeric accuracy claim.
```

Lane A must not invent accuracy percentages, Pulse/Jivi figures, corpus sens/spec, or “clinically verified” absolute language on LibertyMD landing / trust / sample-report shells.

---

## Republication

If a LibertyMD-scoped methodology becomes publicly linkable later:

1. Open a **follow-up ticket** (do not silently flip this file’s approved set without review).  
2. Fill AC1 fields (what / dataset / when / by whom / methodology URL / exact approved wording).  
3. Re-affirm AC2–AC3 and AC6.1/2/4/6/7/8/12/13.  
4. Export new approved strings for Lane A — still **no pending number** in copy while awaiting methodology.

Counsel skim before paid spend that cites an approved number = **DoD+** (N/A while no-ship).

---

## Claim-surface status (this build)

- Prefer **docs-only**. No live LibertyMD marketing accuracy % found to remove (`components/LibertyMD/**` — CSS stop offsets / slate hexes do not count).  
- **CARE-ARCHITECTURE.md** not edited (P3-04 Q2 skip).  
- **AD-PLATFORM-POLICY.md** consumed, not rewritten.  
- No `*_LIVE` flips; no HIPAA invent; no booking-term invent.
