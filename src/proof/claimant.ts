/**
 * Who claimed this moment, and proof that they did.
 *
 * WHY THIS EXISTS
 *
 * The ProofCard already commits to the moment, the evidence and the sponsor. It did
 * not commit to the CLAIMANT — so anyone could take a verified clip and present it as
 * theirs, and the hash would not change. Authorship was the one thing the card
 * asserted without backing.
 *
 * A clipper signs the canonical claim message with their wallet. The signature and
 * pubkey go INSIDE the canonical serialisation, so the hash commits to authorship the
 * same way it commits to the sponsor. Swap the claimant and you get a different card.
 *
 * WHY signMessage AND NOT A TRANSACTION
 *
 * Nothing needs to be written on-chain. `validateStat` is a read-only `.view()`, and
 * the roots are already published by TxODDS. Authorship is an assertion about a claim,
 * not a state change. signMessage is free, instant, needs no SOL and no network — a
 * transaction here would cost the user gas to prove something a signature proves for
 * nothing.
 *
 * THE RULE THAT MAKES THIS REAL
 *
 * `verifyClaimant` MUST be called server-side before a signed card is built. A
 * signature nobody checks is theatre: without verification anyone could POST any
 * pubkey and be credited. Storing a signature is not the same as believing it.
 *
 * Pure — no I/O, no network. Same discipline as the verifier.
 */
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import type { ClaimKind } from '../verify/types.js'

export interface Claimant {
  /** base58 wallet address of whoever claimed this moment. */
  pubkey: string
  /** base64 detached signature over `claimMessage(...)`. */
  signature: string
}

export interface ClaimMessageInput {
  fixtureId: number
  clockStart: number
  clockEnd: number
  claimKind: ClaimKind | string
  /** sha256 of the clip bytes, binding the signature to THIS video. */
  contentHash: string
}

/**
 * The exact bytes a clipper signs.
 *
 * Deterministic and human-readable: a wallet shows this text to the user, so it must
 * say plainly what they are attesting to. Never sign an opaque blob — a user who
 * cannot read what they are signing has not meaningfully consented to it.
 *
 * Every field that identifies the claim is in here. contentHash binds it to the
 * specific clip, so a signature cannot be lifted onto different footage.
 */
export function claimMessage(input: ClaimMessageInput): string {
  return [
    'SIUUU claim',
    `fixture: ${input.fixtureId}`,
    `window: ${input.clockStart}-${input.clockEnd}`,
    `claim: ${input.claimKind}`,
    `clip: ${input.contentHash}`,
  ].join('\n')
}

/**
 * Does this signature actually prove this pubkey signed this claim?
 *
 * Returns false rather than throwing on malformed input — a garbage signature is an
 * unproven claim, not a crash. Callers must treat false as "unsigned", never as
 * "probably fine".
 */
export function verifyClaimant(input: ClaimMessageInput, claimant: Claimant): boolean {
  try {
    const message = new TextEncoder().encode(claimMessage(input))
    const signature = Buffer.from(claimant.signature, 'base64')
    if (signature.length !== 64) return false
    const pubkey = bs58.decode(claimant.pubkey)
    if (pubkey.length !== 32) return false
    return nacl.sign.detached.verify(message, signature, pubkey)
  } catch {
    return false
  }
}

/**
 * The claimant to record on a card, or null.
 *
 * Null on a failed check is deliberate and load-bearing: an unverified signature must
 * NOT be recorded. A card showing a pubkey whose signature did not verify would credit
 * someone who never signed — the exact false attribution this module exists to
 * prevent. Unsigned is honest; wrongly-signed is not.
 */
export function acceptClaimant(
  input: ClaimMessageInput,
  claimant: Claimant | null | undefined,
): Claimant | null {
  if (!claimant) return null
  return verifyClaimant(input, claimant) ? claimant : null
}
