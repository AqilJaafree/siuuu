import { loadFixture, CORPUS_ROOT } from '../txline/corpus.js'
import { timelineFromCapture } from '../timeline/build.js'
import { tsWindowForClock } from '../timeline/clock.js'
import { verify } from '../verify/verifier.js'
import { impactScore } from '../score/impact.js'
import { controversyScore, controversyEvidence, GOAL_WITHDRAWN_SCORE } from '../score/controversy.js'
import { buildProofCard, proofHash, type ProofCard, type Validation } from '../proof/card.js'
import { lookupProven, type ProvenStat } from '../chain/proven.js'
import { PROVEN_STATS } from '../generated/proven-stats.js'
import type { ClaimKind } from '../verify/types.js'

const CLAIM_KINDS: ClaimKind[] = [
  'goal', 'var_overturned_goal', 'var_overturned_penalty', 'mistaken_identity',
  'var_stands', 'goal_withdrawn', 'red_card', 'yellow_card', 'penalty',
]

export interface CliArgs {
  fixtureId: number
  clockStart: number
  clockEnd: number
  claimKind: ClaimKind
  /**
   * The sponsor riding on this claim, or null.
   *
   * Inside the canonical serialisation, therefore inside the hash. That is the whole
   * promise: the sponsor's logo cannot appear on a clip that isn't true, and a
   * sponsor swapped after the fact produces a different hash.
   */
  sponsor?: string | null
}

export interface RunOpts {
  /**
   * The proof ledger to consult. Defaults to the committed one.
   *
   * Injectable so `precompute --prove` can build a card against a proof it has just
   * run, and so tests can state a ledger outright instead of depending on whichever
   * proofs happen to be baked in today.
   */
  provenStats?: readonly ProvenStat[]
}

export function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string => {
    const i = argv.indexOf(flag)
    if (i === -1 || i + 1 >= argv.length) throw new Error(`missing required flag ${flag}`)
    return argv[i + 1]
  }

  const fixtureId = Number(get('--fixture'))
  if (!Number.isInteger(fixtureId)) throw new Error('--fixture must be an integer')

  const m = /^(\d+)-(\d+)$/.exec(get('--clock'))
  if (!m) throw new Error('--clock must look like START-END in seconds, e.g. 4260-4290')
  const clockStart = Number(m[1])
  const clockEnd = Number(m[2])
  if (clockEnd <= clockStart) throw new Error('--clock END must be greater than START')

  const claim = get('--claim')
  if (!CLAIM_KINDS.includes(claim as ClaimKind)) {
    throw new Error(`--claim must be one of: ${CLAIM_KINDS.join(', ')}`)
  }

  // Optional: a claim with no sponsor is the normal case, not a missing argument.
  const si = argv.indexOf('--sponsor')
  const sponsor = si === -1 || si + 1 >= argv.length ? null : argv[si + 1]

  return { fixtureId, clockStart, clockEnd, claimKind: claim as ClaimKind, sponsor }
}

export interface VerifiedCard extends ProofCard {
  hash: string
  impactEvidence: string
  /**
   * What the controversy number was read from, or null when nothing backs it.
   *
   * Derived here rather than in the UI for the same reason `impactEvidence` is: a
   * consumer that re-derives the sentence can drift from the score. Not part of the
   * ProofCard and therefore not bound into `hash` — it is a restatement of
   * `matchedEvents`, which is already hashed.
   */
  controversyEvidence: string | null
}

export function runVerify(args: CliArgs, opts: RunOpts = {}): VerifiedCard {
  const cap = loadFixture(CORPUS_ROOT, args.fixtureId)
  const tl = timelineFromCapture(cap, { mergeHistorical: true })

  const result = verify(tl, {
    fixtureId: args.fixtureId,
    clockStart: args.clockStart,
    clockEnd: args.clockEnd,
    kind: args.claimKind,
  })

  const tsWindow = tsWindowForClock(tl, args.clockStart, args.clockEnd)
  const impact = tsWindow ? impactScore(cap.odds, tsWindow[0], tsWindow[1]) : null

  const withdrawnNoVar = args.claimKind === 'goal_withdrawn' && result.status === 'VERIFIED'

  const controversy = withdrawnNoVar
    ? GOAL_WITHDRAWN_SCORE
    : controversyScore(result.matchedEvents)

  // Follows the same branch as the score above. GOAL_WITHDRAWN_SCORE is a constant,
  // not a table lookup, so controversyEvidence() cannot describe it — say what it
  // actually is instead of letting the generic path name the wrong event.
  const controvEvidence = withdrawnNoVar
    ? 'goal withdrawn · no VAR behind it'
    : controversyEvidence(result.matchedEvents)

  // MERKLE_PROVEN requires a proof that RAN — an entry in the ledger, written only
  // when validateStat returned true against live devnet (see chain/proven.ts). A
  // statKey merely EXISTING for this claim kind earns nothing: deriving the tier from
  // that would assert a proof we never performed. Absent an entry, the card is a read
  // of TxODDS's capture and says exactly that.
  const proven =
    result.status === 'VERIFIED'
      ? lookupProven(opts.provenStats ?? PROVEN_STATS, {
          fixtureId: args.fixtureId,
          clockStart: args.clockStart,
          clockEnd: args.clockEnd,
          claimKind: args.claimKind,
        })
      : null

  const validation: Validation = proven
    ? {
        tier: 'MERKLE_PROVEN',
        statKey: proven.statKey,
        // The seq the proof was actually checked at — not the evidence window's first
        // seq, which is a different fact and would misstate what was proven.
        seq: proven.seq,
        network: proven.network,
        verifiedOnChain: true,
        rootsPda: proven.rootsPda,
      }
    : {
        tier: 'FEED_ATTESTED',
        statKey: null,
        seq: result.seqRange?.[0] ?? -1,
        network: 'devnet',
      }

  const card = buildProofCard({
    fixtureId: args.fixtureId,
    clockStart: args.clockStart,
    clockEnd: args.clockEnd,
    claimKind: args.claimKind,
    // Plan 3 supplies the real clip hash. Until then, the window identifies the moment.
    contentHash: 'x'.repeat(64),
    result,
    impact: impact?.score ?? 0,
    controversy,
    sponsor: args.sponsor ?? null,
    validation,
  })

  return {
    ...card,
    hash: proofHash(card),
    impactEvidence: impact?.evidence ?? 'no odds coverage',
    controversyEvidence: controvEvidence,
  }
}

function render(c: VerifiedCard): string {
  const lines = [
    '',
    `  ${c.status}  ${c.claimKind}`,
    `  fixture ${c.fixtureId} · clock ${c.clockStart}-${c.clockEnd}s`,
    '',
    `  ${c.reason}`,
    '',
    `  impact       ${String(c.impact).padStart(3)}   ${c.impactEvidence}`,
    `  controversy  ${String(c.controversy).padStart(3)}`,
    '',
  ]
  if (c.matchedEvents.length) {
    lines.push('  matched events')
    for (const e of c.matchedEvents) {
      const v = e.varType ? `  ${e.varType}/${e.varOutcome}` : ''
      lines.push(`    Id ${e.eventId}  ${e.action}  clock ${e.clock}  Seq ${e.seq}  confirmed=${e.confirmed}${v}`)
    }
    lines.push('')
  }
  lines.push(`  seqRange     ${c.seqRange ? c.seqRange.join('-') : 'n/a'}`)
  lines.push(`  sha256       ${c.hash}`)
  lines.push('')
  return lines.join('\n')
}

// Entry point when run via `npm run verify -- ...`
if (process.argv[1] && process.argv[1].endsWith('verify.ts')) {
  try {
    console.log(render(runVerify(parseArgs(process.argv.slice(2)))))
  } catch (e) {
    console.error(`error: ${(e as Error).message}`)
    process.exit(1)
  }
}
