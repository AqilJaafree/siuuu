'use client'

import Image from 'next/image'
import type { FeedClip } from '../app/lib/feed.js'
import { StatusPill } from './StatusPill.js'
import { ConnectButton } from './ConnectButton.js'
import { clock } from '../app/lib/format.js'

const SPONSORS = [
  { id: 'adidas', name: 'adidas', src: '/adidas.png' },
  { id: 'nike', name: 'Nike', src: '/nike-logo.png' },
  { id: 'stmy', name: 'STMY', src: '/stmy.png' },
]

export function Profile({ clips, onProof }: { clips: FeedClip[]; onProof: (id: string) => void }) {
  const verified = clips.filter((c) => c.card.status === 'VERIFIED').length
  // Summed, not averaged — and impact only. Impact and controversy are never
  // collapsed into each other, so there is no single "score" to total.
  const impactTotal = clips.reduce((sum, c) => sum + c.card.impact, 0)

  return (
    <div className="col" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottom: '3px solid var(--ink)' }}
      >
        <span className="disp" style={{ fontSize: 22, letterSpacing: '-.5px' }}>
          SIUUU
        </span>
        <ConnectButton />
      </div>

      <div className="col noscroll" style={{ flex: 1, padding: '18px 16px', gap: 16, overflowY: 'auto' }}>
        <div className="col" style={{ alignItems: 'center', gap: 8 }}>
          {/* No account system. A placeholder that reads as a placeholder. */}
          <div className="ph" style={{ width: 78, height: 78, border: '3px solid var(--ink)', borderRadius: 999 }}>
            avatar
          </div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>@clipper</span>

          <div className="row" style={{ border: '2px solid var(--ink)', boxShadow: '3px 3px 0 var(--ink)' }}>
            <Stat value={String(clips.length)} label="CLIPS" />
            <Stat value={String(verified)} label="VERIFIED" colour="#00a83c" />
            <Stat value={String(impactTotal)} label="IMPACT Σ" colour="var(--impact)" last />
          </div>
          <span className="mono" style={{ fontSize: 9, opacity: 0.55, textAlign: 'center', lineHeight: 1.4 }}>
            Counted from {clips.length} verified claims in this session.
          </span>
        </div>

        <div className="col" style={{ gap: 6 }}>
          <span className="lbl" style={{ color: 'var(--sponsor)' }}>
            ENGAGED SPONSORS
          </span>
          <div className="row" style={{ gap: 8 }}>
            {SPONSORS.map((sp) => (
              <div
                key={sp.id}
                className="row"
                style={{
                  width: 46,
                  height: 46,
                  border: '2px solid var(--sponsor)',
                  background: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 6,
                }}
              >
                {/* The three logos have different intrinsic ratios (adidas 1:1,
                    nike 1.69:1). `fill` + contain keeps each one undistorted
                    inside the same square rather than squashing them to one box. */}
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                  <Image src={sp.src} alt={sp.name} fill sizes="34px" style={{ objectFit: 'contain' }} />
                </div>
              </div>
            ))}
          </div>
          {/* Three real brands, zero real engagement. Saying so beats inventing a number. */}
          <span className="mono" style={{ fontSize: 9, opacity: 0.55, lineHeight: 1.4 }}>
            3 campaigns available · engagement not tracked yet
          </span>
        </div>

        <div className="col" style={{ gap: 6 }}>
          <span className="lbl" style={{ opacity: 0.5 }}>
            CLIPS
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {clips.map((clip) => (
              <div
                key={clip.id}
                className="col lift"
                style={{ border: '3px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)', background: 'var(--card)' }}
              >
                <div className="ph" style={{ height: 90, borderBottom: '3px solid var(--ink)', position: 'relative', width: '100%' }}>
                  <span className="mono" style={{ fontSize: 9, opacity: 0.5 }}>
                    {clock(clip.card.clockStart)}
                  </span>
                  <StatusPill
                    status={clip.card.status}
                    size="sm"
                    onOpen={() => onProof(clip.id)}
                    style={{ position: 'absolute', top: 6, left: 6 }}
                  />
                </div>
                <div className="row" style={{ padding: '6px 8px', gap: 5 }}>
                  <span
                    className="mono"
                    aria-label={`Impact ${clip.card.impact}`}
                    style={{ background: 'var(--impact)', color: '#fff', border: '2px solid #111', padding: '1px 5px', fontSize: 10, fontWeight: 700 }}
                  >
                    {clip.card.impact}
                  </span>
                  <span
                    className="mono"
                    aria-label={`Controversy ${clip.card.controversy}`}
                    style={{ background: 'var(--controv)', color: '#111', border: '2px solid #111', padding: '1px 5px', fontSize: 10, fontWeight: 700 }}
                  >
                    {clip.card.controversy}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, colour, last }: { value: string; label: string; colour?: string; last?: boolean }) {
  return (
    <div
      className="col"
      style={{ alignItems: 'center', padding: '6px 14px', borderRight: last ? 'none' : '2px solid var(--ink)' }}
    >
      <span className="mono" style={{ fontWeight: 700, fontSize: 14, color: colour }}>
        {value}
      </span>
      <span className="lbl" style={{ fontSize: 8, opacity: 0.5 }}>
        {label}
      </span>
    </div>
  )
}
