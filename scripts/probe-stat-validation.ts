/**
 * Probe: does TxLINE's stat-validation endpoint actually cover our corpus fixtures?
 *
 * This is the riskiest assumption in Plan 2. `/scores/historical` only serves
 * fixtures started between 2 weeks and 6 hours ago. If stat-validation shares that
 * window, the quarter-finals (9-12 July) expire mid-hackathon and the whole
 * on-chain-proof pitch has no data behind it. Ten minutes here beats finding out
 * after the escrow is built.
 *
 * Run: npx tsx scripts/probe-stat-validation.ts
 */
import * as anchor from '@coral-xyz/anchor'
import BN from 'bn.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token'
import { Transaction } from '@solana/web3.js'
import { Connection, Keypair, PublicKey, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js'
import axios from 'axios'
import nacl from 'tweetnacl'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const NETWORK = 'devnet' as const
const RPC = 'https://api.devnet.solana.com'
const ORIGIN = 'https://txline-dev.txodds.com'
const PROGRAM_ID = new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J')
const TXL_MINT = new PublicKey('4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG')
const IDL_PATH = process.env.IDL_PATH ?? 'idl/txoracle-devnet.json'

const SERVICE_LEVEL_ID = 1 // devnet only documents level 1 (60s delay)
const WEEKS = 4
const LEAGUES: number[] = []

// The marquee case: the mistaken-identity red card in Argentina's QF.
// Id 613, Seq 687, clock 4280, StatusId 4 (H2) -> statKey = 2000 + 6 = 2006 (P2 reds)
const PROBE = { fixtureId: 18222446, seq: 687, statKey: 2006 }

const log = (s: string) => console.log(s)
const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`)
const bad = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`)

async function main() {
  const secret = JSON.parse(readFileSync(join(homedir(), '.config/solana/id.json'), 'utf8'))
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret))
  const connection = new Connection(RPC, 'confirmed')
  const wallet = new anchor.Wallet(payer)
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' })
  anchor.setProvider(provider)

  const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8'))
  const program = new anchor.Program(idl, provider)

  log(`\nwallet   ${payer.publicKey.toBase58()}`)
  log(`network  ${NETWORK} (service level ${SERVICE_LEVEL_ID})`)
  log(`probe    fixture ${PROBE.fixtureId}, seq ${PROBE.seq}, statKey ${PROBE.statKey}\n`)

  // ---- 1. guest JWT -------------------------------------------------------
  log('1. guest JWT')
  const jwt: string = (await axios.post(`${ORIGIN}/auth/guest/start`)).data.token
  ok(`got JWT (${jwt.length} chars)`)

  // ---- 2. subscribe on-chain ---------------------------------------------
  log('\n2. subscribe (free World Cup tier)')
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('token_treasury_v2')], PROGRAM_ID)
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pricing_matrix')], PROGRAM_ID)
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TXL_MINT, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
  const userTokenAccount = getAssociatedTokenAddressSync(
    TXL_MINT, payer.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)

  // The docs derive this ATA but never create it. The free tier charges no TxL,
  // but `subscribe` still requires the account to exist — without this it fails
  // AccountNotInitialized (3012) before it ever looks at the service level.
  const ataInfo = await connection.getAccountInfo(userTokenAccount)
  if (ataInfo === null) {
    log('   TxL ATA missing — creating it (the docs omit this step)')
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey, userTokenAccount, payer.publicKey, TXL_MINT,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    )
    const sig = await provider.sendAndConfirm(tx, [payer])
    ok(`created TxL ATA: ${sig}`)
  } else {
    ok('TxL ATA already exists')
  }

  let txSig: string
  try {
    txSig = await program.methods
      .subscribe(SERVICE_LEVEL_ID, WEEKS)
      .accounts({
        user: payer.publicKey,
        pricingMatrix: pricingMatrixPda,
        tokenMint: TXL_MINT,
        userTokenAccount,
        tokenTreasuryVault,
        tokenTreasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
    ok(`subscribed: ${txSig}`)
  } catch (e) {
    bad(`subscribe failed: ${(e as Error).message.split('\n')[0]}`)
    const logs = (e as any)?.logs
    if (logs) console.log('   program logs:\n     ' + logs.slice(0, 12).join('\n     '))
    throw e
  }

  // ---- 3. sign + activate -------------------------------------------------
  log('\n3. activate API token')
  // `${txSig}:${leagues}:${jwt}` — empty leagues gives the documented `${txSig}::${jwt}`
  const messageString = `${txSig}:${LEAGUES.join(',')}:${jwt}`
  const signature = nacl.sign.detached(new TextEncoder().encode(messageString), payer.secretKey)
  const walletSignature = Buffer.from(signature).toString('base64')

  let apiToken: string
  try {
    const res = await axios.post(
      `${ORIGIN}/api/token/activate`,
      { txSig, walletSignature, leagues: LEAGUES },
      { headers: { Authorization: `Bearer ${jwt}` } },
    )
    apiToken = res.data.token || res.data
    ok(`activated (${String(apiToken).length} chars)`)
  } catch (e) {
    bad(`activate failed: ${(e as any).response?.status} ${JSON.stringify((e as any).response?.data)?.slice(0, 200)}`)
    throw e
  }

  const http = axios.create({
    baseURL: ORIGIN,
    timeout: 30000,
    headers: { Authorization: `Bearer ${jwt}`, 'X-Api-Token': apiToken },
  })

  // ---- 4. Which statKey actually proves the red card? ---------------------
  // The docs say H2 -> +2000, so a P2 second-half red card should be 2006. The
  // corpus puts it at 3006 and the API agrees 2006 is empty. Rather than trust
  // either, sweep the candidates and let the source of record answer.
  log('\n4. stat-validation — sweeping candidate statKeys for the red card')
  const CANDIDATES = [6, 2006, 3006, 4006, 5006, 5, 3005]
  let validation: any = null
  let provenKey: number | null = null

  for (const statKey of CANDIDATES) {
    try {
      const res = await http.get('/api/scores/stat-validation', {
        params: { fixtureId: PROBE.fixtureId, seq: PROBE.seq, statKey },
      })
      const v = res.data.statToProve?.value
      const mark = v > 0 ? '\x1b[32m<-- PROVES THE RED CARD\x1b[0m' : ''
      log(`     statKey ${String(statKey).padStart(4)} -> value ${v}  period ${res.data.statToProve?.period}  ${mark}`)
      if (v > 0 && validation === null) { validation = res.data; provenKey = statKey }
    } catch (e) {
      const st = (e as any).response?.status
      log(`     statKey ${String(statKey).padStart(4)} -> HTTP ${st} ${JSON.stringify((e as any).response?.data)?.slice(0, 80)}`)
    }
  }

  if (validation === null) {
    bad('no candidate statKey carries the red card — mapping unknown, STOP')
    throw new Error('no provable statKey found')
  }
  ok(`statKey ${provenKey} carries it — subTree ${validation.subTreeProof?.length} / main ${validation.mainTreeProof?.length} / stat ${validation.statProof?.length} nodes`)

  // ---- 5. verify on-chain, no intermediary --------------------------------
  log('\n5. validate_stat on-chain (.view())')
  // Proof hashes arrive as byte ARRAYS, not strings — the docs' helper handles
  // both and mine did not.
  const toBytes32 = (v: string | number[] | Uint8Array): number[] => {
    const b = Array.isArray(v) ? Uint8Array.from(v)
      : v instanceof Uint8Array ? v
      : v.startsWith('0x') ? Buffer.from(v.slice(2), 'hex')
      : Buffer.from(v, 'base64')
    if (b.length !== 32) throw new Error(`expected 32 bytes, got ${b.length}`)
    return Array.from(b)
  }
  const toNodes = (ns: any[]) => ns.map((n) => ({ hash: toBytes32(n.hash), isRightSibling: n.isRightSibling }))

  const ts = validation.summary.updateStats.minTimestamp
  const epochDay = Math.floor(ts / 86_400_000)
  const [dailyScoresPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('daily_scores_roots'), new BN(epochDay).toArrayLike(Buffer, 'le', 2)], PROGRAM_ID)
  log(`     epochDay ${epochDay} -> roots PDA ${dailyScoresPda.toBase58()}`)

  try {
    const isValid = await program.methods
      .validateStat(
        new BN(ts),
        {
          fixtureId: new BN(validation.summary.fixtureId),
          updateStats: {
            updateCount: validation.summary.updateStats.updateCount,
            minTimestamp: new BN(validation.summary.updateStats.minTimestamp),
            maxTimestamp: new BN(validation.summary.updateStats.maxTimestamp),
          },
          eventsSubTreeRoot: toBytes32(validation.summary.eventStatsSubTreeRoot),
        },
        toNodes(validation.subTreeProof),
        toNodes(validation.mainTreeProof),
        { threshold: 0, comparison: { greaterThan: {} } },
        {
          statToProve: validation.statToProve,
          eventStatRoot: toBytes32(validation.eventStatRoot),
          statProof: toNodes(validation.statProof),
        },
        null,
        null,
      )
      .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
      .view()

    if (isValid) ok(`ON-CHAIN PROOF PASSED — red card at seq ${PROBE.seq} proven, no intermediary`)
    else bad(`validate_stat returned FALSE — proof did not verify`)

    // A validator that always says true is worthless. Prove it discriminates:
    // statKey 5 is P1 red cards, which is 0 at this seq. Same predicate (> 0)
    // must come back FALSE against the same roots.
    log('\n6. negative control — does the proof actually discriminate?')
    const neg = (await http.get('/api/scores/stat-validation', {
      params: { fixtureId: PROBE.fixtureId, seq: PROBE.seq, statKey: 5 },
    })).data
    const negValid = await program.methods
      .validateStat(
        new BN(neg.summary.updateStats.minTimestamp),
        {
          fixtureId: new BN(neg.summary.fixtureId),
          updateStats: {
            updateCount: neg.summary.updateStats.updateCount,
            minTimestamp: new BN(neg.summary.updateStats.minTimestamp),
            maxTimestamp: new BN(neg.summary.updateStats.maxTimestamp),
          },
          eventsSubTreeRoot: toBytes32(neg.summary.eventStatsSubTreeRoot),
        },
        toNodes(neg.subTreeProof),
        toNodes(neg.mainTreeProof),
        { threshold: 0, comparison: { greaterThan: {} } },
        { statToProve: neg.statToProve, eventStatRoot: toBytes32(neg.eventStatRoot), statProof: toNodes(neg.statProof) },
        null, null,
      )
      .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
      .view()

    if (negValid === false) ok('statKey 5 (P1 reds, value 0) > 0 -> FALSE. The proof discriminates.')
    else bad(`NEGATIVE CONTROL FAILED — returned ${negValid}. A validator that always passes proves nothing.`)
  } catch (e) {
    bad(`validate_stat threw: ${(e as Error).message.split('\n')[0]}`)
    const logs = (e as any)?.logs
    if (logs) console.log('   program logs:\n     ' + logs.slice(0, 15).join('\n     '))
  }
}

main().catch((e) => { console.error('\nPROBE FAILED:', (e as Error).message.split('\n')[0]); process.exit(1) })
