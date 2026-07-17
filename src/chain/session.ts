/**
 * Acquiring the right to ask TxLINE anything.
 *
 * This is `scripts/probe-stat-validation.ts` steps 1-3, lifted verbatim into a
 * callable so the probe and `precompute --prove` run the SAME flow rather than two
 * drifting copies of it. Every non-obvious line below is a gap the probe found the
 * hard way against live devnet; the comments are the map.
 *
 * NEVER import this from anything that reaches a browser. It reads a keypair off
 * disk and signs with it.
 */
import * as anchor from '@coral-xyz/anchor'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token'
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import axios from 'axios'
import nacl from 'tweetnacl'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CONFIG, pdas, type Network } from './config.js'

export interface Session {
  jwt: string
  apiToken: string
  program: anchor.Program
  payer: Keypair
  network: Network
}

export interface SessionOpts {
  idlPath?: string
  keypairPath?: string
  /** Empty = all leagues. The activation message encodes this, so it must round-trip. */
  leagues?: number[]
  /** Weeks of subscription to buy. The World Cup tier is free, so this costs nothing. */
  weeks?: number
  log?: (s: string) => void
}

/**
 * Guest JWT -> TxL ATA -> subscribe -> activate. Returns everything needed to both
 * fetch a validation and prove it on-chain.
 */
export async function acquireSession(network: Network, opts: SessionOpts = {}): Promise<Session> {
  const log = opts.log ?? (() => {})
  const cfg = CONFIG[network]
  const leagues = opts.leagues ?? []
  const weeks = opts.weeks ?? 4

  const keypairPath = opts.keypairPath ?? join(homedir(), '.config/solana/id.json')
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8'))))
  const connection = new Connection(cfg.rpcUrl, 'confirmed')
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: 'confirmed',
  })

  // The IDL is VENDORED and patched with `returns: bool` on validate_stat. A freshly
  // fetched IDL omits it and Anchor's `.view()` refuses the call outright.
  const idlPath = opts.idlPath ?? process.env.IDL_PATH ?? 'idl/txoracle-devnet.json'
  const program = new anchor.Program(JSON.parse(readFileSync(idlPath, 'utf8')), provider)

  // ---- 1. guest JWT -------------------------------------------------------
  const jwt: string = (await axios.post(`${cfg.apiOrigin}/auth/guest/start`)).data.token
  log(`guest JWT acquired (${jwt.length} chars)`)

  // ---- 2. subscribe -------------------------------------------------------
  const p = pdas(network)
  const txlMint = new PublicKey(cfg.txlTokenMint)
  const tokenTreasuryPda = p.tokenTreasury()
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    txlMint, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
  const userTokenAccount = getAssociatedTokenAddressSync(
    txlMint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)

  // The docs derive this ATA but never create it. The free tier charges no TxL, but
  // `subscribe` still requires the account to EXIST — without this it fails
  // AccountNotInitialized (3012) before it ever looks at the service level.
  if ((await connection.getAccountInfo(userTokenAccount)) === null) {
    log('TxL ATA missing — creating it (the docs omit this step)')
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey, userTokenAccount, payer.publicKey, txlMint,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    )
    await provider.sendAndConfirm(tx, [payer])
  }

  const txSig: string = await program.methods
    .subscribe(cfg.serviceLevelId, weeks)
    .accounts({
      user: payer.publicKey,
      pricingMatrix: p.pricingMatrix(),
      tokenMint: txlMint,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc()
  log(`subscribed: ${txSig}`)

  // ---- 3. sign + activate -------------------------------------------------
  // `${txSig}:${leagues}:${jwt}` — empty leagues gives the documented `${txSig}::${jwt}`.
  const message = `${txSig}:${leagues.join(',')}:${jwt}`
  const walletSignature = Buffer.from(
    nacl.sign.detached(new TextEncoder().encode(message), payer.secretKey),
  ).toString('base64')

  const res = await axios.post(
    `${cfg.apiOrigin}/api/token/activate`,
    { txSig, walletSignature, leagues },
    { headers: { Authorization: `Bearer ${jwt}` } },
  )
  const apiToken: string = res.data.token || res.data
  log(`API token activated (${String(apiToken).length} chars)`)

  return { jwt, apiToken, program, payer, network }
}
