# LibertyMD — Ad platform policy review (Google / Meta / TikTok)

**Ticket:** P3-01  
**Retrieved:** 2026-07-31  
**Assessed market:** **United States** only. Product/ad support required for **Spanish and English** (US bilingual). **Other countries: not assessed.**  
**Advertiser entity:** **Newage Healthcare Solutions Private Ltd** (LibertyMD is a brand of that entity). Certification / pre-auth paths below apply to **that named entity**, never as a brand-only grant. **This report does not claim the entity is already certified on any network.**  
**Product class under review:** anonymous-first **AI symptom-assessment** that delivers a **free doctor-ready report** (soft-gated login; no paywall on the report). Not a pharmacy. Not currently live bookable telehealth.  
**Host today:** portfolio host `saksham-experiments.com` + LibertyMD routes (`/liberty-md`, `/liberty-md/chat`, `/liberty-md/report`). No LibertyMD-only domain invent.  
**Authority:** engineering/ops go-no-go research — **not** a counsel memo. Engineering `go` / `conditional-go` ≠ spend authorization.  
**Counsel (DoD+):** recommended skim before first real spend; absence is not a silent FAIL of this ticket.

---

## Scope honesty (locked)

| Lock | Statement |
|---|---|
| Geo | USA assessed. ES + EN support required for creatives/landings. Other geos **not assessed**. |
| Entity | Ads / certification attach to **Newage Healthcare Solutions Private Ltd**. |
| Paid destinations | Prefer **start-consult / free report / sample-report**. **No waitlist** on paid destinations. |
| Booking claims | `$39` / `30 minutes` / `full refund` / “book now” **only when** doctor network + payment gateway mechanisms are live (P2-15 + network). P2-15 engineering may remain deferred *now*; go-live spend that implies bookable care still waits on those mechanisms. |
| Report | Free doctor-ready report; soft gate visible without forced auth. |
| HIPAA | Deferred — **silence OK**; **no attestation invent** in ads or landings. |
| Privacy page (P4-08) | Skipped — document as **conditional-go / gap**; do not build here. |
| This ticket | Docs/research only — **no** creatives, spend, ad accounts, or keyword lists. |

---

## Executive go / no-go table (AC5)

| Network | Verdict | Blocking conditions | Constraints on P3-02…P3-06 |
|---|---|---|---|
| **Google Ads** | **conditional-go** | (1) If ads/landing are classified as **telemedicine / prescription-drug services**, **Newage Healthcare Solutions Private Ltd** must complete **LegitScript Healthcare Merchant (telemedicine)** accreditation **and** Google healthcare certification for the **certified domain** before those ads run — **not claimed done**. (2) Destination must satisfy Destination requirements + honesty (no fake medical help, no unavailable booking offers). (3) Privacy-policy URL gap (P4-08 skipped) and any HIPAA-adjacent overclaim surfaces must be fixed or removed before paid destination. (4) Portfolio host / subdomain clarity must not fail Destination mismatch. | **P3-02/03/04:** free-report / start-consult framing; AI-not-substitute disclaimers; no waitlist; no `$39`/30-min/refund/book-now until live. **P3-05:** landing must stay crawlable, functional, honest; fix overclaims; privacy link when required. **P3-06:** do not build keyword personalisation into certified Rx/telemedicine categories without entity certification; avoid Rx-term keyword targeting until certified. |
| **Meta (Facebook/Instagram)** | **conditional-go** | (1) Creative must not assert/imply viewer **health personal attributes** (“Do you have…?”). (2) No cure/heal/eliminate claims for restricted conditions; no health clickbait / improbable outcomes. (3) Do not use removed health-cause Detailed Targeting as a plan. (4) Same honesty + privacy-URL + no-waitlist + no-live-booking gates as Google. | **P3-02/03/04:** third-person / benefit-of-product framing; ES+EN both must avoid personal-attribute address. **P3-05:** landing honesty + privacy gap. **P3-06:** interest plans must not rely on removed health-cause targeting; prefer broad geo/age + engagement/site audiences. |
| **TikTok** | **conditional-go** | (1) US healthcare ads sit under **Healthcare and Pharmaceuticals** market rules — medical institutions / related services may require local compliance proof and often **18+** targeting; expect account review / documentation for **Newage Healthcare Solutions Private Ltd** — **not claimed approved**. (2) No Rx promotion without FDA-class proof (out of product scope — do not invent). (3) Same honesty + privacy + no-waitlist + no-live-booking gates. | **P3-02/03/04:** educational / free-report framing; 18+ where health category requires; no diagnostic-certainty claims. **P3-05:** landing honesty. **P3-06:** keyword/topic work later must stay outside prohibited Rx / cure claims. |

**Engineering `conditional-go` ≠ spend authorization.** First real spend remains DoD+ counsel skim + network account approval + honesty fixes.

---

## AC1 — Google Ads (Healthcare and medicines)

### Summary for this product class

Google’s **Healthcare and medicines** policy restricts some healthcare content outright and allows others only in approved locations for advertisers who **apply and are approved**. Ads and destinations must follow applicable laws and industry standards. ([Healthcare and medicines](https://support.google.com/adspolicy/answer/176031), retrieved 2026-07-31)

**Prescription drug services / telemedicine:** Google restricts promotion of services related to online prescribing, dispensing, and sale of prescription drugs. Businesses in scope include **online pharmacies and telemedicine providers**. Advertisers **must apply / be certified** to serve ads for prescription drug services; the United States is an allowed location for such promotion **when certified**. Google states it **errs on the side of caution**, especially for landing pages that appear to facilitate online prescription, dispensation, or sale of medicines. ([Prescription drug services](https://support.google.com/adspolicy/answer/15598647?hl=en), retrieved 2026-07-31; parent [Healthcare and medicines](https://support.google.com/adspolicy/answer/176031), retrieved 2026-07-31)

**United States — online pharmacies / telemedicine:** Online pharmacies need LegitScript Internet Pharmacy and/or NABP Digital Pharmacy / `.Pharmacy` pathways as listed by Google. **Telemedicine providers** are allowed if accredited by **LegitScript’s Healthcare Merchant Certification Program** (telemedicine certification for sites that provide virtual healthcare services and **facilitate prescribing**), **and** advertisers must also be **certified with Google**. ([Healthcare and medicines — United States](https://support.google.com/adspolicy/answer/176031), retrieved 2026-07-31)

**Application hygiene:** Identify the correct certification type (e.g. Online Pharmacy, Telemedicine, Health Insurance) — **do not apply for a category that does not match the business model**. Third-party accreditation may be required first (LegitScript, NABP, G2). Applications at **child account** level, not MCC. Website must be fully functional, globally accessible, and meet policy for the target region. ([Prescription drug services — Apply](https://support.google.com/adspolicy/answer/15598647?hl=en), retrieved 2026-07-31; [Apply to advertise certain products & services](https://support.google.com/adspolicy/answer/16908635), retrieved 2026-07-31)

**LibertyMD bucket judgment (research, not a platform letter):**  
- Framed strictly as **AI symptom assessment → free doctor-ready report** (no prescribing, no pharmacy, no live “see a doctor now for $39”) → may remain outside the telemedicine certification gate, **but** Google’s caution language means reviewer classification can still pull the account into restricted healthcare review.  
- Framed as **telemedicine / virtual care that facilitates prescribing**, or landings that look like online Rx pathways → **LegitScript telemedicine + Google certification** for **Newage Healthcare Solutions Private Ltd** on the **certified domain** become blocking. **Not claimed completed.**

**Misrepresentation / health claims (cross-cutting):** Ads/destinations must not deceive. Explicitly disallowed: offering services you cannot deliver (including lacking licenses/qualifications); **lying about services that could put people’s health or safety at risk, such as pretending to provide medical help when you don’t**. Unreliable claims forbid unproven “miracle cures” and improbable outcome framing. Unavailable offers in the ad that are not on the destination are disallowed. ([Misrepresentation](https://support.google.com/adspolicy/answer/6020955?hl=en), retrieved 2026-07-31; [Unreliable claims](https://support.google.com/adspolicy/answer/15936857?hl=en), retrieved 2026-07-31)

**Destination requirements:** Functional on common browsers/devices; crawlable by AdsBot; accessible in targeted location; destination experience not abusive/frustrating; sufficient original content; display/final URL alignment (including subdomain clarity when multiple sites share a parent domain). ([Destination requirements](https://support.google.com/adspolicy/answer/6368661), retrieved 2026-07-31)

### ES / EN notes (Google, USA)

Google publishes translated Help Center pages but states the **English version is the official language used to enforce** Google Ads policies. ([Healthcare and medicines](https://support.google.com/adspolicy/answer/176031), retrieved 2026-07-31)  
**Not found on primary Google sources for this research day:** a USA-specific Spanish-creative certification program distinct from English. Operational implication for P3-02…04: ship **ES and EN** creatives/landings that both meet the same honesty rules; do not treat Spanish as a looser policy lane.

### What this does **not** authorize

- Claiming Newage Healthcare Solutions Private Ltd / LibertyMD is already LegitScript- or Google-certified.  
- Bidding on restricted prescription-drug terms without the matching certification.  
- HIPAA attestation invent.  
- Live booking / `$39` / 30-min / refund claims before mechanisms exist.

---

## AC2 — Meta (Health claims + personal attributes)

### Summary for this product class

**Personal attributes (creative):** Ads must not assert or imply personal attributes of the viewer, including **physical or mental health (including medical conditions)**. Ads cannot imply knowledge of a user’s medical information. Allowed pattern: describe the product/service; “you/your” without a personal attribute. Disallowed pattern: “Do you have diabetes?” / “Depression getting you down?” ([Privacy Violations and Personal Attributes](https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/), retrieved 2026-07-31; Help Center mirror [About Meta's Privacy Violations and Personal Attributes advertising policy](https://www.facebook.com/business/help/2557868957763449), retrieved 2026-07-31 — page thin on fetch; Transparency Center used as primary text)

**Health & Wellness restricted claims:** Among other rules, ads must not include claims to **cure, heal, or eliminate** listed incurable/terminal conditions (Diabetes, Cancer, HIV, Alzheimer’s, etc. — exhaustive list on policy). Clickbait / sensational language with exaggerated or extreme claims, or promises of specific outcomes within a set timeframe without disclaimers, is restricted in health contexts. Age 18+ applies to certain dietary/weight/cosmetic categories (less central to LibertyMD’s free-report funnel, but relevant if creative drifts into wellness-supplement tropes). ([Health and Wellness](https://transparency.meta.com/policies/ad-standards/restricted-goods-services/health-wellness), retrieved 2026-07-31; [About Meta's Health and Wellness advertising policy](https://www.facebook.com/business/help/2489235377779939), retrieved 2026-07-31)

**Targeting:** Meta announced removal of Detailed Targeting options related to topics people may perceive as sensitive, including **health causes** (examples: “Lung cancer awareness”, “World Diabetes Day”, “Chemotherapy”), effective from the 2022 rollout described in Meta’s announcement. ([Removing Certain Ad Targeting Options…](https://www.facebook.com/business/news/removing-certain-ad-targeting-options-and-expanding-our-ad-controls), retrieved 2026-07-31)  
**Implication for P3-06:** do not plan keyword/interest acquisition that depends on those removed health-cause detailed targets.

**LibertyMD bucket judgment:** Meta does **not** publish (on the primary pages retrieved) a LegitScript-style telemedicine pre-auth identical to Google’s US telemedicine row. The practical gates for an AI symptom-assessment advertiser are **creative personal-attribute rules**, **health-claim limits**, **targeting limits**, and **misleading-offer honesty** on the destination. Account-level industry restrictions can still apply at review time — mark as residual uncertainty (not a silent “already clear”).

### ES / EN notes (Meta, USA)

Primary Meta Ad Standards pages retrieved are published in English; Meta’s site offers language switchers. **Not found on primary sources this research day:** a USA-only Spanish exception that weakens personal-attribute or health-claim rules. Ship ES+EN creatives under the **same** personal-attribute ban.

---

## AC3 — TikTok (Healthcare and pharmaceuticals)

### Summary for this product class

TikTok requires healthcare and pharmaceutical advertising to comply with applicable laws in each market. Some content is banned; some is allowed with restrictions. OTC medicines, medical institutions, and pharmacies may be allowed if **market-specific requirements** are met. ([Healthcare and Pharmaceuticals](https://ads.tiktok.com/help/article/tiktok-ads-policy-healthcare-pharmaceuticals), retrieved 2026-07-31; policy page last updated June 2026 per page header)

**United States (market-specific):**

| Topic | Primary-source rule (abbrev.) |
|---|---|
| Prescription medicine | May be allowed with proof of approval/certification from authorities such as FDA; restrict to **18+** |
| OTC medicines | Local law + possible certifications / FDA as applicable; **18+** |
| Medical devices | Local law; certifications may be required; **18+** |
| Medical institutions | Local law; certifications may be required; **18+** |
| Pharmacies | Brick-and-mortar / online may be allowed with third-party licensing proof (e.g. NABP or LegitScript) |
| CBD | Separate stricter path (sales rep, LegitScript, 25+) — **out of LibertyMD product scope** |

Source: [Healthcare and Pharmaceuticals — United States](https://ads.tiktok.com/help/article/tiktok-ads-policy-healthcare-pharmaceuticals), retrieved 2026-07-31.

**LibertyMD bucket judgment:** The free AI consult / doctor-ready report is closest to **medical institution / healthcare service** adjacency, **not** pharmacy or Rx advertising. Expect **documentation / compliance proof** for **Newage Healthcare Solutions Private Ltd**, **18+** targeting when categorized as healthcare, and creative that does not claim FDA-regulated diagnosis devices or Rx. **Not found as an explicit named “AI symptom checker” row** on the US table — residual classification risk; prefer conservative educational framing.

**Note (other markets, not assessed for spend):** Some non-US TikTok rows explicitly disallow online/app remote diagnosis/treatment (e.g. Austria medical institutions examples). Those geos remain **not assessed** for Phase 3 spend.

### ES / EN notes (TikTok, USA)

US table does **not** publish a Spanish-disclosure requirement comparable to some LatAm dietary-supplement rows (Spanish risk disclosures). **Not found for USA:** mandatory Spanish legal footer unique to TikTok healthcare. Operational implication: still ship **ES + EN** creatives/landings for product support; do not invent USA Spanish certification.

---

## AC4 — Landing-page requirements matrix + honesty map

| Requirement | Google | Meta | TikTok | LibertyMD honesty map |
|---|---|---|---|---|
| Functional / crawlable / accessible destination | Required ([Destination requirements](https://support.google.com/adspolicy/answer/6368661), retrieved 2026-07-31) | Ads must lead to working experience consistent with claim (enforced via Ads Standards / review; cite Health & personal-attribute policies above) | Landing pages must comply with local law when category restricted ([TikTok Healthcare](https://ads.tiktok.com/help/article/tiktok-ads-policy-healthcare-pharmaceuticals), retrieved 2026-07-31) | Host `saksham-experiments.com` LibertyMD routes must work; avoid “destination displays we don’t provide services” patterns |
| Ad ↔ destination match | No destination mismatch; subdomain clarity on shared parent domain | Creative/landing consistency under misleading-claims / personal-attribute rules | Category claims must match what landing offers | Paid destinations = **start-consult / free report / sample-report** — **not** waitlist chrome |
| Privacy policy URL | Common reviewer expectation for healthcare-adjacent destinations; not a substitute for product honesty. **P4-08 skipped → documented gap / conditional-go** | Same — privacy link expected for health products in practice; gap remains | Same | Do **not** build P4-08 in this ticket; treat missing dedicated LibertyMD privacy page as **blocking for spend** until re-queued or interim compliant URL exists |
| Disclaimers | AI-generated; not a licensed clinician substitute; emergency → 911/ER | Same + avoid personal-attribute address | Same + 18+ when health category | Required on paid landings (feed → AC6) |
| Prohibited claims | No pretend medical help; no miracle cures; no unavailable `$39`/book-now; no HIPAA attestation invent | No cure/heal list; no “you have X”; no clickbait health outcomes | No Rx without proof; no invented diagnostic device claims | Soft gate OK; free report OK; **no waitlist**; booking terms only when live |
| Fix-before-paid-destination (existing overclaim surfaces) | Flag footer / consent copy that asserts **HIPAA** (or “US HIPAA Safe Harbor”) without attestation; Privacy Policy links that resolve nowhere / to non-LibertyMD privacy | Same | Same | **Fix or strip before paid destination** — do not reopen HIPAA program; do not build P4-08 here |

### Honesty bullets (must hold on every paid destination)

1. **Free doctor-ready report** — no paywall on the report itself (Gate B).  
2. **Soft gate** — report visible without forced auth; login persuasive/dismissible.  
3. **No HIPAA attestation** — silence OK; invent forbidden.  
4. **No waitlist** on paid destinations — prefer start-consult / free report / sample-report.  
5. **No live `$39` / 30-min / full-refund / “book now”** until network + payment gateway mechanisms are live.  
6. **AI-generated assessment** — not a substitute for clinician care; emergencies need emergency care.  
7. **Advertiser identity** — ads/accounts under **Newage Healthcare Solutions Private Ltd**; do not claim brand-only certification.

---

## AC6 — Disclaimer / prohibited-claim feed (copy-intent for P3-02…P3-06)

Numbered items are **intent**, not final creative. Downstream tickets absorb; this ticket does not implement them.

**P3-03 status (2026-07-31):** above-footer trust band + hero invent remediation absorbed P3-03-tagged AC6 items on landing chrome (shipped none named likenesses).

1. **AI not a clinician** — State that LibertyMD is an AI symptom-assessment / doctor-ready report tool, **not** a licensed physician and **not** a diagnosis substitute. · Tags: **P3-02, P3-03, P3-04, P3-05**
2. **Emergency asymmetry** — If symptoms may be emergency, seek emergency care (911/ER) immediately; do not wait on the AI consult. · Tags: **P3-02, P3-03, P3-04, P3-05**
3. **Free report / soft gate truth** — Report is free to view; sign-in optional to save — never imply paywall. · Tags: **P3-02, P3-03, P3-05**
4. **Prohibit HIPAA / compliance invent** — No “HIPAA compliant”, “HIPAA Safe Harbor”, “BAA”, or equivalent attestation in ads or paid landings while deferred. · Tags: **P3-02, P3-03, P3-04, P3-05**
5. **Prohibit waitlist on paid destinations** — No interest-list / “join the waitlist for a doctor” as the paid primary CTA. · Tags: **P3-02, P3-03, P3-05**
6. **Prohibit bookable-care claims until live** — No `$39`, “within 30 minutes”, “full refund”, or “book a doctor now” until payment gateway + network mechanisms are live. · Tags: **P3-02, P3-03, P3-04, P3-05**
7. **Prohibit cure / certainty claims** — No cure/heal/eliminate language; no guaranteed diagnosis accuracy; no “definitive diagnosis”. · Tags: **P3-02, P3-03, P3-04**
8. **Meta personal-attribute ban** — No creative that asserts the viewer has a condition (“Do you have…?”, “Your diabetes…”, “Depression getting you down?”). Prefer product-benefit framing. · Tags: **P3-03, P3-04**
9. **Google misrepresentation / unavailable offers** — Do not imply live medical help or services the destination cannot deliver. · Tags: **P3-02, P3-05**
10. **Privacy URL honesty** — Until P4-08 (or equivalent) ships, do not advertise a Privacy Policy destination that does not exist; treat gap as spend blocker / conditional-go. · Tags: **P3-05**
11. **Entity / certification honesty** — Do not claim Google / LegitScript / Meta / TikTok certification for LibertyMD as a brand; any certification is entity-level for **Newage Healthcare Solutions Private Ltd** and must be earned before asserted. · Tags: **P3-02, P3-06**
12. **ES + EN parity** — Spanish and English creatives/landings carry the same disclaimers and prohibitions; Spanish is not a weaker lane. · Tags: **P3-02, P3-03, P3-04, P3-05**
13. **Adult / age gate where required** — TikTok (and Meta categories that require it): health-category ads **18+** when policy requires. · Tags: **P3-03, P3-04**
14. **Keyword / targeting restraint (P3-06)** — Do not plan Google Rx-term keyword targeting without matching certification; do not plan Meta campaigns on removed health-cause detailed targets. · Tags: **P3-06**

---

## Residual risks & CANNOT RUN / DoD+

| Item | Status |
|---|---|
| Live ad-account approval / certification grant for Newage Healthcare Solutions Private Ltd | **Out of scope / UNTESTABLE** here — pathways documented only |
| Counsel skim before first spend | **DoD+ recommended** — not a silent FAIL of P3-01 if unavailable |
| Spot-check cited URLs at QA time | **DoD+** |
| Exact Google reviewer classification of “AI symptom checker” vs telemedicine | Residual uncertainty — prefer free-report framing; escalate to LegitScript+Google cert path if classified as telemedicine |
| Meta `business/help/2557868957763449` full body | Fetch returned thin shell; **Transparency Center** personal-attributes page used as primary. Help URL retained as secondary pointer |
| TikTok WebFetch timeout on one attempt | Content retrieved successfully via alternate fetch of the same primary URL; stamp retained 2026-07-31 |
| USA-specific Spanish certification extras | **Not found** on primary sources for Google / Meta / TikTok US tables — documented as not found, not invented |

---

## Research method appendix

| Network | Primary sources retrieved 2026-07-31 |
|---|---|
| Google | [Healthcare and medicines](https://support.google.com/adspolicy/answer/176031); [Prescription drug services](https://support.google.com/adspolicy/answer/15598647?hl=en); [Apply to advertise certain products & services](https://support.google.com/adspolicy/answer/16908635); [Misrepresentation](https://support.google.com/adspolicy/answer/6020955?hl=en); [Unreliable claims](https://support.google.com/adspolicy/answer/15936857?hl=en); [Destination requirements](https://support.google.com/adspolicy/answer/6368661) |
| Meta | [Health and Wellness (Transparency Center)](https://transparency.meta.com/policies/ad-standards/restricted-goods-services/health-wellness); [Privacy Violations and Personal Attributes (Transparency Center)](https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/); [About Health and Wellness (Help)](https://www.facebook.com/business/help/2489235377779939); [Removing certain ad targeting options](https://www.facebook.com/business/news/removing-certain-ad-targeting-options-and-expanding-our-ad-controls) |
| TikTok | [Healthcare and Pharmaceuticals](https://ads.tiktok.com/help/article/tiktok-ads-policy-healthcare-pharmaceuticals) (US market table) |

**Citation rule:** material claims use primary URL + `retrieved YYYY-MM-DD`. Secondary blogs were not used as authority. Policy text drifts — re-check dates before spend.

**Out of invent:** creatives, keyword lists, CPC estimates, “we will definitely be approved.”
