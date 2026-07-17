/**
 * Precompute the demo ProofCards at build time.
 *
 * WHY THIS EXISTS
 *
 * `loadFixture` reads the 91MB capture from disk. That corpus is gitignored, so it
 * is not in the repo, not in a Netlify build, and not on any deploy target. Without
 * this step the site builds green and then throws ENOENT on every card — broken in
 * the worst way, because it looks fine until someone taps something.
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
 * WHAT IT DOES NOT COVER
 *
 * The "new clip" upload flow cannot work on a deploy target without the corpus —
 * there is nothing to verify against. That path needs either the live TXLine feed
 * (Plan 2's auth) or a hosted corpus. Do not present a precomputed feed as if it
 * proves the upload path works.
 *
 * Run: npx tsx scripts/precompute-proofs.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { runVerify, type CliArgs } from '../src/cli/verify.js'

const OUT = 'src/generated/demo-proofs.json'

/** The four demo cases from README.md. The last one is the product. */
const DEMOS: Array<CliArgs & { title: string; note: string }> = [
  {
    fixtureId: 18222446, clockStart: 4260, clockEnd: 4290, claimKind: 'mistaken_identity',
    title: 'Referee cards the wrong player — VAR overrules',
    note: 'Argentina QF · the only red card in the tournament capture',
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

const cards = DEMOS.map(({ title, note, ...args }) => {
  const card = runVerify(args)
  console.log(
    `  ${card.status.padEnd(13)} ${args.claimKind.padEnd(22)} ` +
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
console.log(`\n  ${cards.length} cards -> ${OUT} (${rejected.length} REJECTED, as intended)`)
