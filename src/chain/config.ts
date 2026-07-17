import { PublicKey } from '@solana/web3.js'
// NOT `import { BN } from '@coral-xyz/anchor'` — that is what the docs show and it
// throws "does not provide an export named 'BN'" under ESM. Destructuring the
// namespace (`const { BN } = anchor`) then fails with "BN is not a constructor".
import BN from 'bn.js'

export type Network = 'mainnet' | 'devnet'

/**
 * ONE network, everywhere. RPC, program id, guest JWT and activation host must all
 * agree — a devnet subscribe activated against the mainnet host fails (skill §13.1).
 *
 * Free real-time World Cup data is MAINNET service level 12. Devnet only has level
 * 1 (60s delayed). Build the escrow on devnet; prove on mainnet.
 */
export const CONFIG = {
  mainnet: {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    apiOrigin: 'https://txline.txodds.com',
    programId: '9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA',
    txlTokenMint: 'Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL',
    /** 12 = real-time. Mainnet only. */
    serviceLevelId: 12,
  },
  devnet: {
    rpcUrl: 'https://api.devnet.solana.com',
    apiOrigin: 'https://txline-dev.txodds.com',
    programId: '6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J',
    txlTokenMint: '4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG',
    /** 1 = 60s delay. The only level devnet documents. */
    serviceLevelId: 1,
  },
} as const

export const apiBase = (n: Network) => `${CONFIG[n].apiOrigin}/api`

export function pdas(network: Network) {
  const programId = new PublicKey(CONFIG[network].programId)
  const seed = (s: string) => Buffer.from(s)
  const le2 = (n: number) => new BN(n).toArrayLike(Buffer, 'le', 2)

  return {
    programId,
    tokenTreasury: () => PublicKey.findProgramAddressSync([seed('token_treasury_v2')], programId)[0],
    pricingMatrix: () => PublicKey.findProgramAddressSync([seed('pricing_matrix')], programId)[0],
    /** Validate SCORES against this. The one SIUUU needs. */
    dailyScoresRoots: (epochDay: number) =>
      PublicKey.findProgramAddressSync([seed('daily_scores_roots'), le2(epochDay)], programId)[0],
    /** Validate ODDS. Not used — impact is a ranking signal, not a claim. */
    dailyBatchRoots: (epochDay: number) =>
      PublicKey.findProgramAddressSync([seed('daily_batch_roots'), le2(epochDay)], programId)[0],
    /** Fixtures roots bucket per TEN days, not one. */
    tenDailyFixturesRoots: (epochDay: number) =>
      PublicKey.findProgramAddressSync(
        [seed('ten_daily_fixtures_roots'), le2(Math.floor(epochDay / 10) * 10)],
        programId,
      )[0],
  }
}

/** epochDay for a stat's timestamp. Note: ms -> days, NOT seconds. */
export const epochDayOf = (tsMs: number) => Math.floor(tsMs / 86_400_000)
