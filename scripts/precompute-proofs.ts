/**
 * Precompute the demo ProofCards at build time, and — with `--prove` — the on-chain
 * proofs behind them.
 *
 * WHY THIS EXISTS
 *
 * `loadFixture` reads the 91MB capture from disk. That corpus is gitignored, so it
 * is not in the repo, not in a Netlify build, and not on any deploy target. Without
 * this step the site builds green and then throws ENOENT on every card — broken in
 * the worst way, because it looks fine until someone taps something.
 *
 * THE GENERATED FILES ARE THE APP'S ONLY DATA SOURCE
 *
 * src/generated/demo-proofs.json and src/generated/proven-stats.ts are what the
 * deployed site renders. Nothing in app/ calls `runVerify` any more, and there is
 * deliberately no fallback that recomputes when they look wrong — one source, always.
 *
 * So a stale regenerate is a real risk, not a cosmetic one: whatever this script last
 * wrote IS the feed, hashes and tiers included. If you change the DEMOS below, change
 * a scorer, or change the card shape, this must be re-run on a box with the corpus
 * and the result committed — otherwise the site keeps serving the old cards while the
 * code claims to produce new ones, and no test will catch the divergence. Equally, the
 * five cases here must stay in step with app/lib/feed.ts: a case the app asks for and
 * this script never computed throws at build time (`cardFor`), which is the intended
 * failure — loud, not silent.
 *
 * WHY IT IS NOT A CHEAT
 *
 * The verifier and both scorers are PURE functions over an in-memory timeline, and
 * `proofHash` is a canonical serialisation — the same card yields the same sha256
 * every run (pinned by tests/proof/card.test.ts). So a card computed at build time
 * is byte-identical to one computed per-request. The verification is real; only its
 * timing moved. Nothing here is mocked, and if the corpus ever disagrees with these
 * numbers the build fails rather than shipping a stale claim.
 *
 * WHAT `--prove` DOES
 *
 * Calls `validateStat` on live devnet for every PROVABLE claim and writes the ones
 * that PASSED to src/generated/proven-stats.ts. `runVerify` consults that ledger, so
 * a proven card renders MERKLE_PROVEN everywhere — including on Netlify, which has
 * no keypair, no TxODDS credentials and no devnet access. Same argument as the cards
 * above: the proof is real, its timing moved.
 *
 * `--prove` needs a funded devnet keypair at ~/.config/solana/id.json and reaches the
 * network. Without the flag this script behaves exactly as it always has, so CI and
 * Netlify are unaffected.
 *
 * WHAT IT DOES NOT COVER
 *
 * The "new clip" upload flow cannot work on a deploy target without the corpus —
 * there is nothing to verify against. That path needs either the live TXLine feed
 * (Plan 2's auth) or a hosted corpus. Do not present a precomputed feed as if it
 * proves the upload path works.
 *
 * Run: npx tsx scripts/precompute-proofs.ts [--prove]
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { runVerify, type CliArgs } from '../src/cli/verify.js'
import { loadFixture, CORPUS_ROOT } from '../src/txline/corpus.js'
import { timelineFromCapture } from '../src/timeline/build.js'
import { allEvents } from '../src/timeline/events.js'
import { PROVABLE_CLAIMS, statKeyFor } from '../src/chain/statkey.js'
import { proveStatOnChain, makeFetchValidation } from '../src/chain/validate.js'
import { acquireSession } from '../src/chain/session.js'
import type { ProvenStat } from '../src/chain/proven.js'

const OUT = 'src/generated/demo-proofs.json'
const PROVEN_OUT = 'src/generated/proven-stats.ts'
const PROVE = process.argv.includes('--prove')

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`)
const bad = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`)
const info = (s: string) => console.log(`    ${s}`)

/** The five demo cases from README.md. The rejection is the product; the pair is the pitch. */
const DEMOS: Array<CliArgs & { title: string; note: string }> = [
  {
    fixtureId: 18222446, clockStart: 4260, clockEnd: 4290, claimKind: 'mistaken_identity',
    title: 'Referee cards the wrong player — VAR overrules',
    note: 'Argentina QF · the only red card in the tournament capture',
  },
  {
    // The other half of the same moment, and the reason both tiers ship side by side:
    // the RED CARD is a stat in the Merkle tree and proves on-chain; the VAR reason
    // above it is not, and never can be. Same 30 seconds of football, two different
    // strengths of evidence, stated as two different things.
    fixtureId: 18222446, clockStart: 4265, clockEnd: 4295, claimKind: 'red_card',
    title: 'The red card itself — proven on Solana',
    note: 'Argentina QF · statKey 6, proven against daily_scores_roots. The VAR reason next to it cannot be.',
  },
  {
    fixtureId: 18237038, clockStart: 3625, clockEnd: 3655, claimKind: 'var_overturned_goal',
    title: 'Spain goal overturned by VAR',
    note: 'France 0-2 Spain, semi-final · the market did not move',
  },
  {
    fixtureId: 18209181, clockStart: 3910, clockEnd: 3940, claimKind: 'goal',
    title: 'France second goal',
    note: 'France 2-0 Morocco, QF · the real clip we OCR tested',
  },
  {
    fixtureId: 18209181, clockStart: 2910, clockEnd: 2940, claimKind: 'var_overturned_goal',
    title: 'Morocco goal ruled out — was it VAR?',
    note: 'THE PRODUCT. A goal was withdrawn here, but no VAR backs it, so SIUUU refuses to claim VAR.',
  },
]

/**
 * The matched event's side, and the seqs of ITS OWN frames.
 *
 * Both read off the timeline rather than guessed. The statKey is per-participant, so
 * a participant we cannot read is a statKey we must not pick — it returns null and
 * the card stays FEED_ATTESTED.
 */
function eventInfo(fixtureId: number, eventId: number): { participant: 1 | 2 | null; seqs: number[] } | null {
  const tl = timelineFromCapture(loadFixture(CORPUS_ROOT, fixtureId), { mergeHistorical: true })
  const e = allEvents(tl).find((ev) => ev.eventId === eventId)
  if (!e) return null
  return { participant: e.participant, seqs: e.frames.map((f) => f.seq).sort((a, b) => a - b) }
}

/**
 * Prove every provable demo claim on-chain. Returns only the proofs that PASSED.
 *
 * Failure of any kind — no statKey, HTTP error, program threw, or the program simply
 * returned false — yields no entry, and the card stays FEED_ATTESTED. There is no
 * branch here that marks a card proven without a `validateStat` call returning true.
 */
async function proveAll(): Promise<ProvenStat[]> {
  console.log('\n--prove: calling validateStat on live devnet\n')
  const session = await acquireSession('devnet', { log: (s) => ok(s) })
  const fetchValidation = makeFetchValidation(session)
  const out: ProvenStat[] = []

  for (const { title: _t, note: _n, ...args } of DEMOS) {
    const label = `${args.fixtureId} ${args.claimKind}`

    if (!PROVABLE_CLAIMS.has(args.claimKind)) {
      // Not a gap. There is NO statKey for a VAR decision — no amount of engineering
      // makes one provable, and pretending otherwise is the overclaim we refuse.
      info(`${label.padEnd(32)} not provable — no statKey exists for this claim kind`)
      continue
    }

    const card = runVerify(args)
    if (card.status !== 'VERIFIED') {
      info(`${label.padEnd(32)} ${card.status} — nothing to prove`)
      continue
    }

    const eventId = card.matchedEvents[0]?.eventId
    const ev = eventId === undefined ? null : eventInfo(args.fixtureId, eventId)
    const statKey = ev?.participant == null ? null : statKeyFor(args.claimKind, ev.participant)

    if (statKey === null || ev === null) {
      info(`${label.padEnd(32)} no statKey (participant ${ev?.participant}) — staying FEED_ATTESTED`)
      continue
    }

    // WHICH SEQ, AND WHY IT IS BOUNDED TO THIS EVENT'S OWN FRAMES
    //
    // The tree carries the increment at the seq the feed booked it, which is not
    // necessarily the event's FIRST frame. Measured on the red card (event 613,
    // frames 686/687/688): statKey 6 reads value 0 at seq 686 and value 1 at 687.
    // So proving at seqRange[0] alone would report FALSE for a red card that
    // demonstrably happened.
    //
    // The candidates are therefore this event's own frames, ascending — and NOTHING
    // else. It is tempting to sweep forward until the counter moves; that would be a
    // real defect, because a `> 0` counter stays true forever and a wide sweep would
    // happily "prove" this card using a LATER, unrelated red card. Bounded to the
    // event's own frames, a passing proof can only have been incremented by this
    // event. That the earlier seqs return FALSE is not noise — it is the evidence
    // that the validator discriminates instead of always saying yes.
    let proved = false
    for (const seq of ev.seqs) {
      try {
        const r = await proveStatOnChain(
          {
            network: 'devnet',
            fixtureId: args.fixtureId,
            seq,
            statKey,
            // "At least one happened" — exactly the fact the claim asserts, no more.
            predicate: { threshold: 0, comparison: 'greaterThan' },
          },
          { program: session.program, fetchValidation },
        )

        if (!r.valid) {
          info(`${label.padEnd(32)} seq ${seq}: value ${r.statValue} -> validateStat false`)
          continue
        }

        ok(`${label.padEnd(32)} MERKLE_PROVEN  statKey ${statKey} seq ${seq} value ${r.statValue}`)
        info(`roots PDA ${r.rootsPda}`)
        out.push({
          fixtureId: args.fixtureId,
          clockStart: args.clockStart,
          clockEnd: args.clockEnd,
          claimKind: args.claimKind,
          statKey,
          seq,
          rootsPda: r.rootsPda,
          network: 'devnet',
          statValue: r.statValue,
          provenAt: new Date().toISOString(),
        })
        proved = true
        break
      } catch (e) {
        // An error is not a proof. Say so and keep going through this event's frames.
        info(`${label.padEnd(32)} seq ${seq}: errored — ${(e as Error).message.split('\n')[0]}`)
      }
    }

    if (!proved) bad(`${label.padEnd(32)} no frame of this event proved — staying FEED_ATTESTED`)
  }

  return out
}

function writeProvenLedger(entries: ProvenStat[]) {
  const body = `// GENERATED by \`npx tsx scripts/precompute-proofs.ts --prove\`. Do not hand-edit.
//
// Every entry here is a validateStat call that RAN against live devnet and returned
// true. Hand-writing an entry would make a card claim MERKLE_PROVEN for a proof that
// never happened — regenerate this file instead, from a box with a funded keypair.
//
// Committed on purpose: the proof needs live TxODDS credentials, a keypair and
// devnet, none of which exist on a Netlify build box. Running it locally against the
// real chain and baking the verified result in moves the proof in TIME, not in kind.
import type { ProvenStat } from '../chain/proven.js'

export const PROVEN_STATS: readonly ProvenStat[] = ${JSON.stringify(entries, null, 2)}
`
  mkdirSync(dirname(PROVEN_OUT), { recursive: true })
  writeFileSync(PROVEN_OUT, body)
}

async function main() {
  // The proofs are run BEFORE the cards are built, because the tier is inside the
  // hash. The freshly-proven ledger is then handed to `runVerify` EXPLICITLY rather
  // than round-tripped through the file it has already imported — a module cache does
  // not reload, so re-importing would silently hash every card against the OLD
  // ledger and ship a FEED_ATTESTED card for a proof that passed.
  //
  // Without --prove this is undefined and `runVerify` falls back to the committed
  // ledger, which is byte-identical to what was just written. Same cards, same
  // hashes, on Netlify and here.
  let proven: ProvenStat[] | undefined

  if (PROVE) {
    proven = await proveAll()
    writeProvenLedger(proven)
    console.log(`\n  ${proven.length} proof(s) that actually ran -> ${PROVEN_OUT}`)
    if (proven.length === 0) {
      console.error('\nFAIL: --prove ran and proved nothing. Not writing a feed that claims otherwise.')
      process.exit(1)
    }
  }

  console.log('')
  const cards = DEMOS.map(({ title, note, ...args }) => {
    const card = runVerify(args, { provenStats: proven })
    console.log(
      `  ${card.status.padEnd(9)} ${card.validation.tier.padEnd(14)} ${args.claimKind.padEnd(20)} ` +
      `impact ${String(card.impact).padStart(3)}  controversy ${String(card.controversy).padStart(3)}  ${card.hash.slice(0, 12)}…`,
    )
    return { ...card, title, note }
  })

  // Sanity: if the corpus ever stops producing the rejection, the demo's whole point
  // is gone and we should fail the build rather than ship a feed that only says yes.
  const rejected = cards.filter((c) => c.status === 'REJECTED')
  if (rejected.length === 0) {
    console.error('\nFAIL: no REJECTED card. The honest-refusal case is the product — refusing to build.')
    process.exit(1)
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ generatedFrom: 'exact-match-txline-raw', cards }, null, 2))
  const provenCount = cards.filter((c) => c.validation.tier === 'MERKLE_PROVEN').length
  console.log(
    `\n  ${cards.length} cards -> ${OUT} ` +
    `(${rejected.length} REJECTED as intended, ${provenCount} MERKLE_PROVEN)`,
  )
}

main().catch((e) => {
  console.error(`\nprecompute failed: ${(e as Error).message.split('\n')[0]}`)
  process.exit(1)
})
