'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { truncateMiddle } from '../app/lib/format.js'

/**
 * The prototype's LOGIN button, made real.
 *
 * It connects a wallet and nothing more. It does NOT gate the feed: viewing proofs
 * stays open to everyone, because a verification anyone can check is the entire
 * product and putting it behind a wallet would be the opposite of the pitch.
 *
 * Connected state shows the pubkey in MONO, because it is a fact — the same rule that
 * puts the roots PDA and the proof hash in mono, and prose in Inter.
 */
export function ConnectButton({ dark = false }: { dark?: boolean }) {
  const { publicKey, connected, connecting, disconnect } = useWallet()
  const { setVisible } = useWalletModal()

  // `dark` = sitting on the feed's photo backdrop, which is dark in BOTH themes, so
  // this chrome must be fixed — it cannot follow the theme.
  //
  // It previously paired `background: var(--paper)` with a hardcoded `#111` text.
  // --paper flips to #0a0a0a in dark mode while #111 does not, so the connected
  // pubkey rendered near-black on near-black. Both values are now literals: a token
  // that flips can never be paired with a colour that doesn't.
  const shell = dark
    ? { background: '#fdfbf7', color: '#111', boxShadow: '3px 3px 0 rgba(0,0,0,.45)' }
    : { background: 'var(--card)', color: 'var(--ink)', boxShadow: '3px 3px 0 var(--ink)' }

  if (connected && publicKey) {
    const addr = publicKey.toBase58()
    return (
      <button
        className="btn mono"
        onClick={() => void disconnect()}
        title={`${addr} — click to disconnect`}
        aria-label={`Wallet connected: ${addr}. Click to disconnect.`}
        style={{ ...shell, padding: '6px 12px', fontSize: 11, gap: 6 }}
      >
        <span
          aria-hidden
          style={{ width: 7, height: 7, background: 'var(--verified)', border: '1px solid #111', flex: 'none' }}
        />
        {truncateMiddle(addr, 4, 4)}
      </button>
    )
  }

  return (
    <button
      className="btn"
      onClick={() => setVisible(true)}
      disabled={connecting}
      style={{ ...shell, padding: '6px 14px', fontSize: 11 }}
    >
      {connecting ? 'CONNECTING' : 'CONNECT'}
    </button>
  )
}
