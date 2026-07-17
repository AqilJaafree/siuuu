'use server'

import { runVerify } from '../src/cli/verify.js'
import { findCase, type FeedClip } from './lib/feed.js'
import { clock } from './lib/format.js'

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
 * Runs a claim through the real engine and reports what each stage of the pipeline
 * actually did.
 *
 * The six steps are the six stages `runVerify` genuinely performs — load the
 * capture, build the timeline, match the claim, score it, build the card, hash it.
 * Their final states are read off the returned card, not scripted: when the claim
 * has no backing event, step 3 lands REJECTED and says so. The pipeline is not a
 * progress bar with a foregone conclusion.
 */
export async function verifyCase(id: string): Promise<VerifyResponse | { error: string }> {
  const spec = findCase(id)
  if (!spec) return { error: `No such demo case: ${id}` }

  const card = runVerify({
    fixtureId: spec.fixtureId,
    clockStart: spec.clockStart,
    clockEnd: spec.clockEnd,
    claimKind: spec.claimKind,
  })

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
      // Never "Publishing" and never "Anchored" — nothing is submitted on-chain.
      n: '6',
      name: 'State the tier',
      state: 'DONE',
      detail: `${card.validation.tier} · ${card.validation.network}`,
    },
  ]

  return { clip: { ...spec, card }, steps }
}
