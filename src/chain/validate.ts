import * as anchor from '@coral-xyz/anchor'
// NOT `import { BN } from '@coral-xyz/anchor'` — the docs show that and it throws
// "does not provide an export named 'BN'" under ESM; `const { BN } = anchor` then
// fails with "BN is not a constructor". Same story as config.ts.
import BN from 'bn.js'
import { ComputeBudgetProgram, Connection, Keypair } from '@solana/web3.js'
import axios from 'axios'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CONFIG, pdas, epochDayOf, type Network } from './config.js'

export function toBytes32(value: string | number[] | Uint8Array): number[] {
  const bytes = Array.isArray(value)
    ? Uint8Array.from(value)
    : value instanceof Uint8Array
      ? value
      : value.startsWith('0x')
        ? Buffer.from(value.slice(2), 'hex')
        : Buffer.from(value, 'base64')
  if (bytes.length !== 32) throw new Error(`Expected 32 bytes, received ${bytes.length}`)
  return Array.from(bytes)
}

export interface RawProofNode { hash: string | number[] | Uint8Array; isRightSibling: boolean }

export function toProofNodes(nodes: RawProofNode[]) {
  return nodes.map((n) => ({ hash: toBytes32(n.hash), isRightSibling: n.isRightSibling }))
}

/**
 * Shape the API's validation response into the program's arg types.
 *
 * Note: the response's `statToProve.period` echoes StatusId, not the key's period —
 * it read 4 for every key in the probe's sweep. Never derive a statKey from it.
 */
export function shapeValidation(v: any) {
  return {
    fixtureSummary: {
      fixtureId: new BN(v.summary.fixtureId),
      updateStats: {
        updateCount: v.summary.updateStats.updateCount,
        minTimestamp: new BN(v.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(v.summary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: toBytes32(v.summary.eventStatsSubTreeRoot),
    },
    fixtureProof: toProofNodes(v.subTreeProof),
    mainTreeProof: toProofNodes(v.mainTreeProof),
    stat1: {
      statToProve: v.statToProve,
      eventStatRoot: toBytes32(v.eventStatRoot),
      statProof: toProofNodes(v.statProof),
    },
    minTimestamp: v.summary.updateStats.minTimestamp as number,
  }
}

export interface ValidateArgs {
  network: Network
  fixtureId: number
  seq: number
  statKey: number
  predicate: { threshold: number; comparison: 'greaterThan' | 'lessThan' | 'equalTo' }
}

/** GET /api/scores/stat-validation. Both headers are required (skill §7). */
export function makeFetchValidation(creds: { jwt: string; apiToken: string }) {
  return async (a: ValidateArgs): Promise<any> => {
    const res = await axios.get(`${CONFIG[a.network].apiOrigin}/api/scores/stat-validation`, {
      params: { fixtureId: a.fixtureId, seq: a.seq, statKey: a.statKey },
      headers: { Authorization: `Bearer ${creds.jwt}`, 'X-Api-Token': creds.apiToken },
      timeout: 30_000,
    })
    return res.data
  }
}

/**
 * The TxOracle program, from the VENDORED IDL.
 *
 * `anchor idl fetch` returns an IDL with no `returns` on `validate_stat`, which makes
 * Anchor's `.view()` reject the call outright — even though the docs' own example
 * calls `.view()` and reads a bool. `idl/txoracle-devnet.json` is that IDL patched
 * with `returns: 'bool'`. Do not re-fetch and expect `.view()` to work.
 */
export async function loadProgram(
  network: Network,
  opts: { idlPath?: string; keypairPath?: string } = {},
): Promise<anchor.Program> {
  const idlPath = opts.idlPath ?? process.env.IDL_PATH ?? 'idl/txoracle-devnet.json'
  const keypairPath = opts.keypairPath ?? join(homedir(), '.config/solana/id.json')
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8'))))
  const connection = new Connection(CONFIG[network].rpcUrl, 'confirmed')
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: 'confirmed',
  })
  return new anchor.Program(JSON.parse(readFileSync(idlPath, 'utf8')), provider)
}

export interface ProofOutcome {
  /** What the program returned. `false` is a real answer, not an error. */
  valid: boolean
  /** The daily_scores_roots PDA the proof was checked against. */
  rootsPda: string
  /** The stat value the feed put in the tree at this seq — what the proof is about. */
  statValue: number
  /** The stat's timestamp, which selects the roots bucket. */
  minTimestamp: number
}

/**
 * Prove a stat against `daily_scores_roots` on-chain, and report WHAT was proven.
 *
 * Read-only via `.view()`. Needs a raised compute budget — 1_400_000. Without it the
 * simulation runs out and fails in a way that looks like an invalid proof (skill
 * §13.5), which would be the worst kind of wrong: an honest claim rejected by a
 * misconfiguration.
 */
export async function proveStatOnChain(
  args: ValidateArgs,
  deps: { program: anchor.Program; fetchValidation: (a: ValidateArgs) => Promise<any> },
): Promise<ProofOutcome> {
  const v = await deps.fetchValidation(args)
  const shaped = shapeValidation(v)
  const dailyScoresPda = pdas(args.network).dailyScoresRoots(epochDayOf(shaped.minTimestamp))

  const valid: boolean = await deps.program.methods
    .validateStat(
      new BN(shaped.minTimestamp),
      shaped.fixtureSummary,
      shaped.fixtureProof,
      shaped.mainTreeProof,
      { threshold: args.predicate.threshold, comparison: { [args.predicate.comparison]: {} } },
      shaped.stat1,
      null,
      null,
    )
    .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .view()

  return {
    valid,
    rootsPda: dailyScoresPda.toBase58(),
    statValue: v.statToProve?.value ?? 0,
    minTimestamp: shaped.minTimestamp,
  }
}

/** Boolean-only form. The predicate either held against the chain or it did not. */
export async function validateStatOnChain(
  args: ValidateArgs,
  deps: { program: anchor.Program; fetchValidation: (a: ValidateArgs) => Promise<any> },
): Promise<boolean> {
  return (await proveStatOnChain(args, deps)).valid
}
