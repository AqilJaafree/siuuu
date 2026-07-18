'use client'

import { useState } from 'react'
import { Home as HomeIcon, PlusSquare, User } from 'lucide-react'
import type { DemoCase, FeedClip } from '../app/lib/feed.js'
import { Home } from './Home.js'
import { ClipScreen } from './ClipScreen.js'
import { Profile } from './Profile.js'
import { ProofSheet } from './ProofSheet.js'

type Tab = 'home' | 'clip' | 'profile'

export function App({ initialClips, cases }: { initialClips: FeedClip[]; cases: DemoCase[] }) {
  const [tab, setTab] = useState<Tab>('home')
  const [clips, setClips] = useState<FeedClip[]>(initialClips)
  const [proofId, setProofId] = useState<string | null>(null)

  const proofClip = clips.find((c) => c.id === proofId) ?? null

  function onVerified(clip: FeedClip) {
    // Re-posting a case the feed already holds replaces it rather than duplicating —
    // it is the same claim over the same window, so it is the same card.
    setClips((cs) => [clip, ...cs.filter((c) => c.id !== clip.id)])
    setTab('home')
    setProofId(clip.id)
  }

  function onCardUpdate(clip: FeedClip) {
    // A card was re-signed in the sheet. Replace it in place — same id, same claim,
    // now with an author bound into the hash. No tab change: the sheet stays open.
    setClips((cs) => cs.map((c) => (c.id === clip.id ? clip : c)))
  }

  return (
    <main
      className="row"
      style={{ minHeight: '100dvh', justifyContent: 'center', alignItems: 'flex-start', padding: '28px 0' }}
    >
      {/* Mobile-first. This is a phone activity; the frame states that plainly. */}
      <div
        className="col"
        style={{
          width: 360,
          maxWidth: '100vw',
          border: '2px solid var(--ink)',
          borderRadius: 40,
          padding: 10,
          background: 'var(--card)',
          boxShadow: '10px 10px 0 var(--ink)',
        }}
      >
        <div
          className="col"
          style={{
            border: '2px solid var(--ink)',
            borderRadius: 30,
            overflow: 'hidden',
            background: 'var(--paper)',
            height: 720,
            position: 'relative',
          }}
        >
          {tab === 'home' && <Home clips={clips} onProof={setProofId} />}
          {tab === 'clip' && <ClipScreen cases={cases} onVerified={onVerified} />}
          {tab === 'profile' && <Profile clips={clips} onProof={setProofId} />}

          <nav
            className="row"
            style={{
              flex: 'none',
              justifyContent: 'space-around',
              alignItems: 'center',
              padding: '12px 8px 14px',
              borderTop: '3px solid var(--ink)',
              background: 'var(--paper)',
            }}
          >
            <NavItem on={tab === 'home'} onClick={() => setTab('home')} label="Home">
              <HomeIcon size={24} strokeWidth={2.5} />
            </NavItem>
            <NavItem on={tab === 'clip'} onClick={() => setTab('clip')} label="Clip">
              <PlusSquare size={24} strokeWidth={2.5} />
            </NavItem>
            <NavItem on={tab === 'profile'} onClick={() => setTab('profile')} label="Profile">
              <User size={24} strokeWidth={2.5} />
            </NavItem>
          </nav>

          <ProofSheet clip={proofClip} onClose={() => setProofId(null)} onUpdate={onCardUpdate} />
        </div>
      </div>
    </main>
  )
}

function NavItem({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button className={`navitem ${on ? 'on' : ''}`} onClick={onClick} aria-current={on ? 'page' : undefined}>
      {children}
      {label}
    </button>
  )
}
