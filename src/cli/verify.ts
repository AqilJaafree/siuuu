import { loadFixture, CORPUS_ROOT } from '../txline/corpus.js'
import { timelineFromCapture } from '../timeline/build.js'
import { tsWindowForClock } from '../timeline/clock.js'
import { verify } from '../verify/verifier.js'
import { impactScore } from '../score/impact.js'
import { controversyScore, GOAL_WITHDRAWN_SCORE } from '../score/controversy.js'
import { buildProofCard, proofHash, type ProofCard } from '../proof/card.js'
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

  return { fixtureId, clockStart, clockEnd, claimKind: claim as ClaimKind }
}

export interface VerifiedCard extends ProofCard {
  hash: string
  impactEvidence: string
}

export function runVerify(args: CliArgs): VerifiedCard {
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

  const controversy =
    args.claimKind === 'goal_withdrawn' && result.status === 'VERIFIED'
      ? GOAL_WITHDRAWN_SCORE
      : controversyScore(result.matchedEvents)

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
  })

  return { ...card, hash: proofHash(card), impactEvidence: impact?.evidence ?? 'no odds coverage' }
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
