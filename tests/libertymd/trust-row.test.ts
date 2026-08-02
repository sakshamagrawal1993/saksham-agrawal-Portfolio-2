/**
 * P3-03 — Trust row honesty allow-list / invent remediation.
 *   deno test --no-config --allow-read tests/libertymd/trust-row.test.ts
 */
import {
  isLibertyMdTrustPermissionId,
  LIBERTYMD_TRUST_PERMISSIONS,
  LIBERTYMD_TRUST_STAR_RATINGS,
} from '../../components/LibertyMD/libertymd-trust-content.ts'

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const ROOT = new URL('../../', import.meta.url)
const EN_I18N = new URL('i18n/locales/en.json', ROOT)
const APP = new URL('components/LibertyMD/LibertyMDApp.tsx', ROOT)
const MARKETING = new URL('components/LibertyMD/LibertyMDMarketingSections.tsx', ROOT)
const PERMISSIONS = new URL('docs/libertymd/trust-permissions.md', ROOT)

function assertTrue(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

function assertEquals(a: unknown, b: unknown, msg?: string) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

Deno.test('P3-03 · permission allow-list empty (shipped none)', async () => {
  assertEquals(LIBERTYMD_TRUST_PERMISSIONS.length, 0, 'no named likenesses')
  assertEquals(LIBERTYMD_TRUST_STAR_RATINGS.length, 0, 'no unsourced stars')
  assertEquals(isLibertyMdTrustPermissionId('any'), false)
  const stub = await Deno.readTextFile(PERMISSIONS)
  assertTrue(/shipped none|empty set|None/i.test(stub), 'permissions stub records empty')
})

Deno.test('P3-03 · EN trust band has AC6.1 + AC6.2; no invent', async () => {
  const en = JSON.parse(await Deno.readTextFile(EN_I18N)) as {
    trust: Record<string, string>
    app: Record<string, string>
    marketing: { care: Record<string, string> }
  }

  assertTrue(/not a licensed physician|not a clinician/i.test(en.trust.aiNotClinicianBody), 'AC6.1')
  assertTrue(/911|ER/i.test(en.trust.emergencyBody), 'AC6.2')
  assertTrue(!/HIPAA Compliant|HIPAA Private|Safe Harbor|BAA/i.test(JSON.stringify(en.trust)), 'no HIPAA invent on trust')
  assertTrue(!/\d{2,3}\s*%|Pulse|Jivi|sensitivit|specificit/i.test(JSON.stringify(en.trust)), 'no P3-04 accuracy %')
  assertTrue(!/4\.5|1,?000,?000|1M\+/i.test(JSON.stringify(en.trust)), 'no stars / million invent on trust')

  // BO 2026-08-01 — the hero trust row now carries the operating business's real
  // figures: a 4.5 rating, a 1,000,000+ install base, and HIPAA compliance. The
  // BO supplied these as facts about the existing service this build replaces;
  // they are NOT derived from this project's database, which holds only rebuild
  // data. P3-03/P3-04 forbade them while they were unsubstantiated — that ban is
  // lifted for these three, and only these three.
  //
  // What is still enforced: the figures live in i18n (one auditable place, no
  // hardcoded numerals in TSX), and the P3-04 ban on *clinical accuracy* claims
  // is untouched — a marketing rating is not a sensitivity/specificity claim.
  assertTrue(/4\.5/.test(en.app.heroTrustRating), 'rating sourced from i18n')
  assertTrue(/1,?000,?000/.test(en.app.trustedBy), 'install base sourced from i18n')
  assertTrue(/HIPAA/i.test(en.app.heroTrustHipaa), 'HIPAA claim sourced from i18n')
  const appSource = await Deno.readTextFile('components/LibertyMD/LibertyMDApp.tsx')
  assertTrue(!/1,000,000\+|4\.5 out of 5/.test(appSource), 'trust figures must not be hardcoded in TSX')
  assertTrue(/doctor-ready report/i.test(en.app.heroTrustReport), 'hero process proof')

  assertTrue(!/\$39/.test(en.marketing.care.priceLead + (en.marketing.care.price || '')), 'care $39 invent gone')
  assertTrue(/anytime|AI chat/i.test(en.marketing.care.pillAvailability), '24/7 softened')
})

Deno.test('P3-03 · App does not mount above-footer trust band; hero invent gone', async () => {
  const app = await Deno.readTextFile(APP)
  const marketing = await Deno.readTextFile(MARKETING)

  assertTrue(!app.includes('LibertyMDTrustRow'), 'above-footer trust band unmounted')
  assertTrue(app.includes('LibertyMDFooterRibbon'), 'frozen ribbon still mounted in footer')

  // BO 2026-08-01 — star / install-base chrome is reinstated with the operating
  // business's real figures (see the i18n assertions above). The bans that
  // remain are the ones about *fabrication*: no hardcoded numerals in TSX, so
  // every figure stays traceable to one i18n entry that can be corrected in one
  // place if the business numbers change.
  assertTrue(/UsersRound/.test(app), 'install-base chrome mounted')
  assertTrue(!/>4\.5</.test(app), 'rating must come from i18n, not a hardcoded literal')
  assertTrue(!/>1,000,000/.test(app), 'install base must come from i18n, not a hardcoded literal')
  assertTrue(app.includes('libertymd-hero-trust-row'), 'hero strip retained')
  // The hero row is now the three BO-supplied trust signals (rating, install
  // base, HIPAA); the free-report line moved out of it.
  assertTrue(app.includes('heroTrustRating') && app.includes('trustedBy') && app.includes('heroTrustHipaa'),
    'hero trust row renders the three BO figures')
  assertTrue(!app.includes('LibertyMDPatientStoriesSection'), 'patient rail unmounted')

  assertTrue(marketing.includes('return null'), 'patient stories stub')
  assertTrue(!/Jordan|Marcus|Ana, 29|Patient story/.test(marketing), 'named patient invent gone')
  assertTrue(!/\$39\s*\/\s*visit/.test(marketing), 'pricing $39 row gone')
  assertTrue(!/Available 24\/7/.test(marketing), '24/7 invent gone')
  assertTrue(!/Dr\. Maya Chen/.test(marketing), 'named MD invent gone')
})
