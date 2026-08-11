/**
 * P5-DDX T9 — orchestration rules for the async mini-differential.
 *
 * These test the three things that cannot live in a prompt: ordering, staleness,
 * and the stop rule. Each is enforced in the proxy precisely because a model
 * cannot be relied on to enforce it.
 */
import {
  buildDifferentialHint,
  decideDifferentialStop,
  differentialUpdatePatch,
  isDifferentialFresh,
  readStoredDifferential,
  shouldAcceptDifferentialWrite,
  shouldScheduleDifferential,
  stalenessTurns,
  type StoredDifferential,
} from '../../supabase/functions/libertymd-care-proxy/lib/differential.ts'
import type { ConsultationRow, DifferentialResult } from '../../supabase/functions/libertymd-care-proxy/lib/types.ts'

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(`${message || 'assertEquals'}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

/** Flag on by default for these tests; the off case is asserted explicitly. */
function withFlag<T>(enabled: boolean, run: () => T): T {
  const previous = Deno.env.get('LIBERTYMD_ASYNC_DIFFERENTIAL')
  Deno.env.set('LIBERTYMD_ASYNC_DIFFERENTIAL', enabled ? 'true' : 'false')
  try {
    return run()
  } finally {
    if (previous === undefined) Deno.env.delete('LIBERTYMD_ASYNC_DIFFERENTIAL')
    else Deno.env.set('LIBERTYMD_ASYNC_DIFFERENTIAL', previous)
  }
}

function stored(overrides: Partial<StoredDifferential> = {}): StoredDifferential {
  return {
    entries: [
      { condition: 'Viral pharyngitis', confidence: 85 },
      { condition: 'Streptococcal pharyngitis', confidence: 10 },
      { condition: 'Allergic pharyngitis', confidence: 5 },
    ],
    topConfidence: 85,
    redFlagsOutstanding: [],
    computedAtTurn: 8,
    ...overrides,
  }
}

function result(overrides: Partial<DifferentialResult> = {}): DifferentialResult {
  return {
    entries: [
      { condition: 'Viral pharyngitis', confidence: 85 },
      { condition: 'Streptococcal pharyngitis', confidence: 10 },
      { condition: 'Allergic pharyngitis', confidence: 5 },
    ],
    top_confidence: 85,
    discriminator: 'tonsillar exudate',
    red_flags_outstanding: [],
    delta_reason: 'test',
    computed_at_turn: 9,
    ...overrides,
  }
}

// --- Rule 1: ordering -------------------------------------------------------

Deno.test('P5-DDX: a newer differential is accepted', () => {
  assertEquals(shouldAcceptDifferentialWrite(stored({ computedAtTurn: 8 }), result({ computed_at_turn: 9 })), true)
})

Deno.test('P5-DDX: an out-of-order differential is discarded, not merged', () => {
  // The exact race the guard exists for: a slow turn-7 run returning after
  // turn-9's has already landed. Wall-clock arrival says nothing about which
  // view of the case is newer, so the turn index is the only ordering.
  assertEquals(shouldAcceptDifferentialWrite(stored({ computedAtTurn: 9 }), result({ computed_at_turn: 7 })), false)
})

Deno.test('P5-DDX: a same-turn rerun does not overwrite', () => {
  assertEquals(shouldAcceptDifferentialWrite(stored({ computedAtTurn: 9 }), result({ computed_at_turn: 9 })), false)
})

Deno.test('P5-DDX: the first differential is always accepted', () => {
  assertEquals(shouldAcceptDifferentialWrite(stored({ computedAtTurn: null }), result({ computed_at_turn: 6 })), true)
})

// --- Rule 2: staleness ------------------------------------------------------

Deno.test('P5-DDX: staleness is measured in turns, not wall clock', () => {
  assertEquals(stalenessTurns(stored({ computedAtTurn: 6 }), 9), 3)
  assertEquals(stalenessTurns(stored({ computedAtTurn: null }), 9), null)
})

Deno.test('P5-DDX: a 3-turn-old differential is still fresh, 4 is not', () => {
  assertEquals(isDifferentialFresh(stored({ computedAtTurn: 6 }), 9), true)
  assertEquals(isDifferentialFresh(stored({ computedAtTurn: 5 }), 9), false)
})

Deno.test('P5-DDX: a stale differential is withheld from the question generator entirely', () => {
  withFlag(true, () => {
    // Withheld rather than downgraded: aiming questions with a four-turn-old
    // view of the case is worse than not aiming them at all.
    assertEquals(buildDifferentialHint(stored({ computedAtTurn: 4 }), 9), null)
    assertEquals(buildDifferentialHint(stored({ computedAtTurn: 8 }), 9) !== null, true)
  })
})

Deno.test('P5-DDX: no hint when there is no differential yet', () => {
  withFlag(true, () => {
    assertEquals(buildDifferentialHint(stored({ entries: [], topConfidence: null, computedAtTurn: null }), 9), null)
  })
})

Deno.test('P5-DDX: partial differential is withheld and cannot stop the interview', () => {
  withFlag(true, () => {
    const partial = stored({ entries: [{ condition: 'Viral pharyngitis', confidence: 85 }] })
    assertEquals(buildDifferentialHint(partial, 9), null)
    assertEquals(decideDifferentialStop(partial, 9).reason, 'no_differential')
  })
})

// --- Rule 3: the stop rule --------------------------------------------------

Deno.test('P5-DDX stop rule: all four conditions met', () => {
  withFlag(true, () => {
    const decision = decideDifferentialStop(stored(), 9)
    assertEquals(decision.stop, true)
    assertEquals(decision.reason, 'confidence_met')
  })
})

Deno.test('P5-DDX stop rule: below the turn floor never stops', () => {
  withFlag(true, () => {
    const decision = decideDifferentialStop(stored({ computedAtTurn: 3 }), 3)
    assertEquals(decision.stop, false)
    assertEquals(decision.reason, 'below_turn_floor')
  })
})

Deno.test('P5-DDX stop rule: below the confidence floor never stops', () => {
  withFlag(true, () => {
    const decision = decideDifferentialStop(stored({ topConfidence: 79 }), 9)
    assertEquals(decision.stop, false)
    assertEquals(decision.reason, 'below_confidence')
  })
})

Deno.test('P5-DDX stop rule: 80 percent meets the confidence floor', () => {
  withFlag(true, () => {
    const decision = decideDifferentialStop(stored({ topConfidence: 80 }), 9)
    assertEquals(decision.stop, true)
    assertEquals(decision.reason, 'confidence_met')
  })
})

Deno.test('P5-DDX stop rule: outstanding red flags block a confident differential', () => {
  withFlag(true, () => {
    // The safety half of the rule. Confidence measures diagnostic certainty,
    // not information sufficiency: a model can be 95% sure of viral pharyngitis
    // after three questions while never having asked whether the patient can
    // swallow. Both must hold.
    const decision = decideDifferentialStop(
      stored({ topConfidence: 95, redFlagsOutstanding: ['difficulty swallowing'] }),
      9,
    )
    assertEquals(decision.stop, false)
    assertEquals(decision.reason, 'red_flags_outstanding')
  })
})

Deno.test('P5-DDX stop rule: a stale differential cannot end a consult', () => {
  withFlag(true, () => {
    const decision = decideDifferentialStop(stored({ computedAtTurn: 4 }), 9)
    assertEquals(decision.stop, false)
    assertEquals(decision.reason, 'stale')
  })
})

Deno.test('P5-DDX stop rule: with the flag off nothing stops or schedules', () => {
  withFlag(false, () => {
    assertEquals(decideDifferentialStop(stored(), 9).reason, 'flag_off')
    assertEquals(shouldScheduleDifferential(9), false)
    assertEquals(buildDifferentialHint(stored(), 9), null)
  })
})

Deno.test('P5-DDX: scheduling starts at the configured floor, not before', () => {
  withFlag(true, () => {
    assertEquals(shouldScheduleDifferential(3), false)
    assertEquals(shouldScheduleDifferential(4), true)
  })
})

// --- persistence ------------------------------------------------------------

Deno.test('P5-DDX: the update patch clamps confidence and turn into column range', () => {
  const patch = differentialUpdatePatch(result({ top_confidence: 140, computed_at_turn: 99 })) as Record<string, unknown>
  assertEquals(patch.differential_top_confidence, 100)
  assertEquals(patch.differential_computed_at_turn, 15)
})

Deno.test('P5-DDX: reading a row with no differential yields a safe empty view', () => {
  const view = readStoredDifferential({} as ConsultationRow)
  assertEquals(view.entries.length, 0)
  assertEquals(view.topConfidence, null)
  assertEquals(view.computedAtTurn, null)
  assertEquals(view.redFlagsOutstanding.length, 0)
})
