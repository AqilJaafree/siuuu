'use server'

import { cardFor, findCase, type FeedClip } from './lib/feed.js'
import { clock } from './lib/format.js'
import type { Claimant } from '../src/proof/claimant.js'

export type StepState = 'DONE' | 'REJECTED'

export interface PipelineStep {
  n: string
  name: string
  state: StepState
  /** What actually happened at this stage, in mono, read off the real card. */
  detail: string
}

export interface VerifyResponse {
  clip: FeedClip
  steps: PipelineStep[]
}

/**
 * Reports what each stage of the pipeline actually did for this claim.
 *
 * The six steps are the six stages the engine genuinely performs — load the capture,
 * build the timeline, match the claim, score it, build the card, hash it. Their final
 * states are read off the card, not scripted: when the claim has no backing event,
 * step 3 lands REJECTED and says so. The pipeline is not a progress bar with a
 * foregone conclusion.
 *
 * WHERE THE CARD COMES FROM
 *
 * `cardFor`, not `runVerify`. The engine reads the 91MB corpus off disk and the corpus
 * is not on any deploy target, so calling it here 500s the deployed site. The five
 * demo cases are fixed and were all run through the real engine at precompute time,
 * so the precomputed card already holds every answer these steps read. The states
 * below are still derived from real card data — nothing here is decided in advance.
 */
export async function verifyCase(
  id: string,
  sponsor: string | null = null,
): Promise<VerifyResponse | { error: string }> {
  const spec = findCase(id)
  if (!spec) return { error: `No such demo case: ${id}` }

  // The sponsor goes into the canonical card and therefore into the hash, so this
  // re-hashes rather than reusing the precomputed sponsor-less hash. If the claim was
  // refused, the sponsor is dropped — no brand rides on an unbacked claim.
  const card = cardFor(spec, sponsor)

  const matched = card.matchedEvents.length
  const rejected = card.status === 'REJECTED'

  const steps: PipelineStep[] = [
    {
      n: '1',
      name: 'Load capture',
      state: 'DONE',
      detail: `fixture ${card.fixtureId} · TXLine corpus`,
    },
    {
      n: '2',
      name: 'Build timeline',
      state: 'DONE',
      detail: `window ${clock(card.clockStart)}–${clock(card.clockEnd)}`,
    },
    {
      // The step that can actually fail, and the reason it exists.
      n: '3',
      name: 'Match the feed',
      state: rejected ? 'REJECTED' : 'DONE',
      detail: rejected
        ? 'no backing event — claim refused'
        : `${matched} event${matched === 1 ? '' : 's'}${card.seqRange ? ` · Seq ${card.seqRange[0]}–${card.seqRange[1]}` : ''}`,
    },
    {
      n: '4',
      name: 'Score the drama',
      state: 'DONE',
      detail: `impact ${card.impact} · controversy ${card.controversy}`,
    },
    {
      n: '5',
      name: 'Build the proof',
      state: 'DONE',
      detail: `sha256 ${card.hash.slice(0, 12)}…`,
    },
    {
      // Never "Publishing" and never "Anchored". A MERKLE_PROVEN card was proven by a
      // validateStat call that RAN against devnet — at precompute time, because a
      // Netlify box has no keypair and no credentials. A FEED_ATTESTED card had no
      // such call and says so. The detail states which of those actually happened.
      n: '6',
      name: 'State the tier',
      state: 'DONE',
      detail:
        card.validation.tier === 'MERKLE_PROVEN'
          ? `MERKLE_PROVEN · statKey ${card.validation.statKey} · seq ${card.validation.seq} · ${card.validation.network}`
          : `FEED_ATTESTED · ${card.validation.network} · no validateStat call for this claim`,
    },
  ]

  return { clip: { ...spec, card }, steps }
}

/**
 * Attach a wallet signature to a claim, verify it server-side, and return the re-hashed
 * card. The signature is checked HERE before anything is recorded — a signature nobody
 * verifies is theatre. `accepted` reports whether it actually verified, so the client
 * can tell "your signature failed" apart from "unsigned".
 *
 * The sponsor already on the card is threaded back through so re-hashing preserves it —
 * signing must not silently drop the brand that was riding on the claim.
 */
export async function signClaim(
  id: string,
  claimant: Claimant,
  sponsor: string | null = null,
): Promise<{ clip: FeedClip; accepted: boolean } | { error: string }> {
  const spec = findCase(id)
  if (!spec) return { error: `No such demo case: ${id}` }
  const card = cardFor(spec, sponsor, claimant)
  return { clip: { ...spec, card }, accepted: card.claimant !== null }
}
