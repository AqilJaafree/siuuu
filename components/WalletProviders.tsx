'use client'

import { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { CONFIG } from '../src/chain/config.js'

// The adapter's own stylesheet. Imported so the wallet picker works at all, then
// overridden wholesale in globals.css — it ships rounded corners, gradients and a
// backdrop blur, none of which exist in this product.
import '@solana/wallet-adapter-react-ui/styles.css'

/**
 * Wallet context for the whole app.
 *
 * `'use client'` is enough here — no `dynamic(..., { ssr: false })`. That matters:
 * wrapping the tree in an SSR-disabled component would stop the FEED from rendering
 * on the server too, and the feed is the product. Nothing below touches `window`
 * during render; the adapters look for injected providers in effects, after mount.
 *
 * The RPC endpoint comes from the same CONFIG the proofs use, so the network a
 * visitor connects to is the network the cards were proven against. Two sources of
 * truth for "which network" is how you end up proving on devnet and connecting to
 * mainnet.
 */
export function WalletProviders({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => CONFIG.devnet.rpcUrl, [])
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      {/* autoConnect only reconnects a wallet the user already authorised on this
          origin. It never triggers a first-time approval prompt. */}
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
