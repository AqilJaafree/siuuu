'use client'

import { useState } from 'react'
import { Heart, MessageSquare, Share2 } from 'lucide-react'
import type { FeedClip } from '../app/lib/feed.js'
import { StatusPill } from './StatusPill.js'
import { clock } from '../app/lib/format.js'

/** `24:32 · goal → action_discarded · Seq 534` — the voice. Facts, no adjectives. */
function metaLine(clip: FeedClip): string {
  const { card } = clip
  const actions = card.matchedEvents.map((e) => e.action)
  const chain = actions.length ? actions.join(' → ') : 'no backing event'
  const seq = card.seqRange ? ` · Seq ${card.seqRange[0]}` : ''
  return `${clock(card.clockStart)} · ${chain}${seq}`
}

export function Home({ clips, onProof }: { clips: FeedClip[]; onProof: (id: string) => void }) {
  return (
    <div className="col" style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      <div
        className="row"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 5,
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <span
          className="disp"
          style={{ fontSize: 22, color: '#fff', letterSpacing: '-.5px', textShadow: '2px 2px 0 rgba(0,0,0,.5)' }}
        >
          SIUUU
        </span>
        <span className="btn" style={{ background: 'var(--paper)', color: '#111', padding: '6px 14px', fontSize: 11, boxShadow: '3px 3px 0 rgba(0,0,0,.4)' }}>
          LOGIN
        </span>
      </div>

      <div className="noscroll" style={{ flex: 1, overflowY: 'auto', scrollSnapType: 'y mandatory' }}>
        {clips.map((clip) => (
          <ClipTile key={clip.id} clip={clip} onProof={() => onProof(clip.id)} />
        ))}
      </div>
    </div>
  )
}

function ClipTile({ clip, onProof }: { clip: FeedClip; onProof: () => void }) {
  const [liked, setLiked] = useState(false)
  const { card } = clip

  return (
    <div className="phd" style={{ height: 653, scrollSnapAlign: 'start', position: 'relative' }}>
      {/* No clip bytes exist for these fixtures. An honest hatched empty that names
          what is missing, rather than a stock video pretending to be the moment. */}
      <div className="col" style={{ alignItems: 'center', gap: 6, padding: 24, textAlign: 'center' }}>
        <span className="mono" style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
          NO CLIP BYTES
        </span>
        <span className="mono" style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', lineHeight: 1.5 }}>
          fixture {card.fixtureId}
          <br />
          {clip.fixtureLabel}
        </span>
      </div>

      <StatusPill status={card.status} onOpen={onProof} style={{ position: 'absolute', top: 58, left: 16 }} />

      {/* Two numbers. Never averaged. */}
      <div className="row" style={{ position: 'absolute', top: 58, right: 16, gap: 6 }}>
        <span
          className="mono"
          aria-label={`Impact ${card.impact}`}
          style={{ background: 'var(--impact)', color: '#fff', border: '2px solid #111', padding: '3px 6px', fontSize: 12, fontWeight: 700 }}
        >
          {card.impact}
        </span>
        <span
          className="mono"
          aria-label={`Controversy ${card.controversy}`}
          style={{ background: 'var(--controv)', color: '#111', border: '2px solid #111', padding: '3px 6px', fontSize: 12, fontWeight: 700 }}
        >
          {card.controversy}
        </span>
      </div>

      <div className="col" style={{ position: 'absolute', right: 14, bottom: 120, gap: 15, alignItems: 'center' }}>
        <div className="col" style={{ alignItems: 'center', gap: 4 }}>
          <button
            className="rail"
            onClick={() => setLiked((v) => !v)}
            aria-pressed={liked}
            aria-label="Like"
            style={{ background: liked ? 'var(--impact)' : 'rgba(0,0,0,.35)' }}
          >
            <Heart size={22} strokeWidth={2.5} fill={liked ? '#fff' : 'none'} />
          </button>
          {/* No social backend. The count is this session's real state — 0 or 1 —
              rather than an invented 12.3k. */}
          <span className="mono" style={{ fontSize: 9, color: '#fff' }}>
            {liked ? 1 : 0}
          </span>
        </div>
        <div className="col" style={{ alignItems: 'center', gap: 4 }}>
          <button className="rail" aria-label="Replies — not implemented" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
            <MessageSquare size={22} strokeWidth={2.5} />
          </button>
          <span className="mono" style={{ fontSize: 9, color: 'rgba(255,255,255,.5)' }}>
            —
          </span>
        </div>
        <div className="col" style={{ alignItems: 'center', gap: 4 }}>
          <button
            className="rail"
            onClick={onProof}
            style={{ background: 'var(--controv)', color: '#111', borderColor: '#111' }}
          >
            PROOF
          </button>
        </div>
        <div className="col" style={{ alignItems: 'center', gap: 4 }}>
          <button className="rail" aria-label="Share — not implemented" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
            <Share2 size={22} strokeWidth={2.5} />
          </button>
          <span className="mono" style={{ fontSize: 9, color: 'rgba(255,255,255,.5)' }}>
            —
          </span>
        </div>
      </div>

      <div className="col" style={{ position: 'absolute', left: 16, right: 80, bottom: 26, gap: 6 }}>
        <span className="prose" style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>
          {clip.title}
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'rgba(255,255,255,.8)' }}>
          {metaLine(clip)}
        </span>
      </div>
    </div>
  )
}
