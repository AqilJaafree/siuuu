'use client'

import { useState } from 'react'
import { Link as LinkIcon, X } from 'lucide-react'
import type { FeedClip } from '../app/lib/feed.js'
import { STATUS_FILL, TIER_COPY, clock, clockSpoken, pillClass, truncateMiddle } from '../app/lib/format.js'

/**
 * The Proof Card. Where the product either earns trust or doesn't.
 *
 * Show the seams. Every instinct says "clean this up, hide the JSON, make the event
 * names friendly". All of it is resisted here on purpose: a Proof Card that looks
 * designed looks authored, and authored means someone could have written anything.
 */
export function ProofSheet({ clip, onClose }: { clip: FeedClip | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const open = !!clip

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {/* Flat ink at 40%. No backdrop blur — glass hides construction, this style shows it. */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,.4)',
          opacity: open ? 1 : 0,
          transition: 'opacity 160ms ease-out',
        }}
      />
      <div
        className="col noscroll"
        role="dialog"
        aria-modal="true"
        aria-label="Proof card"
        aria-hidden={!open}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '88%',
          background: 'var(--paper)',
          borderTop: '5px solid var(--ink)',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 160ms ease-out',
          overflowY: 'auto',
        }}
      >
        {clip && <ProofBody key={clip.id} clip={clip} onClose={onClose} copied={copied} setCopied={setCopied} />}
      </div>
    </div>
  )
}

function ProofBody({
  clip,
  onClose,
  copied,
  setCopied,
}: {
  clip: FeedClip
  onClose: () => void
  copied: boolean
  setCopied: (v: boolean) => void
}) {
  const { card } = clip
  const tier = TIER_COPY[card.validation.tier]
  // Both conditions, deliberately. The tier alone is a label; `verifiedOnChain` is the
  // record that a call actually returned true. Rendering the strong branch on the
  // label alone would let a mislabelled card show proof coordinates it never earned.
  const proven = card.validation.tier === 'MERKLE_PROVEN' && card.validation.verifiedOnChain === true

  return (
    <div className="col" style={{ padding: 18, gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* Status, large, top. Not tappable here — you are already looking at the evidence. */}
        <span
          className={pillClass(card.status)}
          style={{ background: STATUS_FILL[card.status], fontSize: 12, padding: '7px 14px', cursor: 'default' }}
        >
          {card.status}
        </span>
        <button
          className="btn"
          onClick={onClose}
          aria-label="Close proof card"
          style={{ background: 'var(--paper)', color: 'var(--ink)', width: 34, height: 34, boxShadow: '2px 2px 0 var(--ink)' }}
        >
          <X size={16} strokeWidth={3} />
        </button>
      </div>

      {/* The reason. States what is true and what is missing. For the REJECTED case
          this line is the entire product, so it leads. */}
      <div className="col" style={{ gap: 5 }}>
        <span className="lbl" style={{ opacity: 0.5 }}>
          {card.claimKind}
        </span>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, fontWeight: 600 }}>{card.reason}</p>
      </div>

      <div className="col" style={{ gap: 3 }}>
        <span className="lbl" style={{ opacity: 0.5 }}>
          MATCH · TIME
        </span>
        <span
          className="mono"
          style={{ fontSize: 14, fontWeight: 700 }}
          aria-label={`Fixture ${card.fixtureId}, ${clockSpoken(card.clockStart)} to ${clockSpoken(card.clockEnd)}`}
        >
          {card.fixtureId} · {clock(card.clockStart)}–{clock(card.clockEnd)}
        </span>
      </div>

      {/* Raw feed data. It should LOOK raw. Action names are not humanised —
          `var_end` stays `var_end`. The rawness is the credibility. */}
      <div className="col" style={{ gap: 6 }}>
        <span className="lbl" style={{ opacity: 0.5 }}>
          MATCH FEED · {card.matchedEvents.length} EVENT{card.matchedEvents.length === 1 ? '' : 'S'}
        </span>
        <div className="sunk col" style={{ padding: 0 }}>
          <div className="row" style={{ padding: '7px 10px', borderBottom: '2px solid var(--ink)', gap: 8 }}>
            <span className="mono" style={{ width: 34, fontSize: 9, fontWeight: 700 }}>ID</span>
            <span className="mono" style={{ flex: 1, fontSize: 9, fontWeight: 700 }}>ACTION</span>
            <span className="mono" style={{ width: 40, fontSize: 9, fontWeight: 700 }}>CLOCK</span>
            <span className="mono" style={{ width: 30, fontSize: 9, fontWeight: 700 }}>SEQ</span>
            <span className="mono" style={{ width: 24, fontSize: 9, fontWeight: 700 }}>CONF</span>
          </div>

          {card.matchedEvents.length === 0 ? (
            // Visibly empty, not hidden. Nothing matched, and the card says so.
            <div className="col" style={{ padding: '12px 10px', gap: 4 }}>
              <span className="mono" style={{ fontSize: 10, fontWeight: 700 }}>no matched events</span>
              <span className="mono" style={{ fontSize: 9, opacity: 0.6, lineHeight: 1.4 }}>
                Nothing in the feed backs this claim. There is no table to show.
              </span>
            </div>
          ) : (
            card.matchedEvents.map((ev) => (
              <div
                key={`${ev.eventId}-${ev.seq}`}
                className="col"
                style={{ borderBottom: '1px solid rgba(128,128,128,.28)' }}
              >
                <div className="row" style={{ padding: '7px 10px', gap: 8 }}>
                  <span className="mono" style={{ width: 34, fontSize: 10 }} aria-label={`Id ${ev.eventId}`}>
                    {ev.eventId}
                  </span>
                  <span className="mono" style={{ flex: 1, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ev.action}
                  </span>
                  <span className="mono" style={{ width: 40, fontSize: 10 }} aria-label={clockSpoken(ev.clock)}>
                    {clock(ev.clock)}
                  </span>
                  <span className="mono" style={{ width: 30, fontSize: 10 }} aria-label={`Seq ${ev.seq}`}>
                    {ev.seq}
                  </span>
                  <span className="mono" style={{ width: 24, fontSize: 10 }}>
                    {ev.confirmed === null ? '—' : ev.confirmed ? 'yes' : 'no'}
                  </span>
                </div>
                {ev.varType && (
                  <div className="row" style={{ padding: '0 10px 7px 44px' }}>
                    <span className="mono" style={{ fontSize: 9, opacity: 0.75 }}>
                      var {ev.varType}/{ev.varOutcome}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <span className="mono" style={{ fontSize: 9, opacity: 0.6 }}>
          Seq range {card.seqRange ? `${card.seqRange[0]}–${card.seqRange[1]}` : 'n/a — nothing matched'}
        </span>
      </div>

      {/* Two numbers, side by side, NEVER summed. Impact 1 next to controversy 90 is
          the France–Spain moment; collapsing it to 45 destroys the only interesting
          thing about it. */}
      <div className="row" style={{ gap: 12 }}>
        <ScoreBox
          label="IMPACT"
          value={card.impact}
          colour="var(--impact)"
          evidence={card.impactEvidence}
        />
        <ScoreBox
          label="CONTROVERSY"
          value={card.controversy}
          colour="var(--controv)"
          evidence={card.controversyEvidence}
          emptyNote="nothing backs this score"
        />
      </div>

      {/* OCR confidence. The prototype has a bar here; the engine has no OCR read,
          because no clip bytes are supplied. An invented percentage would be exactly
          the lie this product refuses, so the section states the absence instead. */}
      <div className="col" style={{ gap: 5 }}>
        <span className="lbl" style={{ opacity: 0.5 }}>
          READ CONFIDENCE
        </span>
        <div className="sunk row" style={{ padding: '9px 10px', gap: 8, alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 10, fontWeight: 700 }}>n/a</span>
          <span className="mono" style={{ fontSize: 9, opacity: 0.7, lineHeight: 1.4 }}>
            No clip bytes read. This claim was resolved from the feed window, not from pixels.
          </span>
        </div>
      </div>

      {/* Proof tier. MERKLE_PROVEN and FEED_ATTESTED must never blur into each other.
          A proven card shows the coordinates anyone can re-check — statKey, seq, and
          the roots PDA it terminated at. An attested card shows none of that, because
          none of it exists, and says plainly that no proof ran. The two blocks are
          deliberately different shapes: same badge in different colours would invite
          exactly the skim-read that makes "attested" feel like "proven". */}
      <div className="col" style={{ gap: 6 }}>
        <span className="lbl" style={{ opacity: 0.5 }}>
          WHAT BACKS THIS
        </span>
        <div
          className="col"
          style={{
            border: '3px solid var(--ink)',
            // The proven card is the only thing in this sheet that earns a hard shadow.
            boxShadow: proven ? '4px 4px 0 var(--verified)' : 'none',
            padding: 10,
            gap: 8,
          }}
        >
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            <span
              className="pill"
              style={{ background: tier.fill, fontSize: 10, padding: '4px 10px', cursor: 'default' }}
            >
              {tier.label}
            </span>
            <span className="mono" style={{ fontSize: 9, opacity: 0.7 }}>
              {card.validation.network}
            </span>
          </div>
          <span style={{ fontSize: 11, lineHeight: 1.45 }}>{tier.rests}</span>

          {proven ? (
            <>
              {/* Facts, in mono, because they are coordinates and not prose. Anyone can
                  take these three and re-run validateStat themselves. */}
              <div className="sunk col" style={{ padding: '8px 10px', gap: 5 }}>
                <Coord label="statKey" value={String(card.validation.statKey)} />
                <Coord label="seq" value={String(card.validation.seq)} />
                <Coord label="roots PDA" value={card.validation.rootsPda ?? '—'} wrap />
              </div>
              <span className="mono" style={{ fontSize: 9, opacity: 0.7, lineHeight: 1.4 }}>
                validateStat returned true against daily_scores_roots. Run at build time — a
                deploy box has no keypair — against the same chain you can check it on.
              </span>
            </>
          ) : (
            <>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="mono" style={{ fontSize: 9, opacity: 0.7 }}>
                  statKey none — no Merkle-backed stat exists for this claim
                </span>
                <span className="mono" style={{ fontSize: 9, opacity: 0.7 }}>
                  seq {card.validation.seq}
                </span>
              </div>
              {/* Never say "anchored" when nothing was anchored. */}
              <span className="mono" style={{ fontSize: 9, opacity: 0.7, lineHeight: 1.4 }}>
                Not submitted on-chain: no validateStat call ran for this card.
              </span>
            </>
          )}
        </div>
      </div>

      {/* The sponsor. Inside the hash, so it is evidence, not decoration — and there is
          nothing to show on a refused claim, because a refused claim carries no brand. */}
      <div className="col" style={{ gap: 6 }}>
        <span className="lbl" style={{ color: 'var(--sponsor)' }}>
          SPONSOR ON THIS CLAIM
        </span>
        <div className="sunk col" style={{ padding: '9px 10px', gap: 4 }}>
          <span className="mono" style={{ fontSize: 11, fontWeight: 700 }}>
            {card.sponsor ?? 'none'}
          </span>
          <span className="mono" style={{ fontSize: 9, opacity: 0.65, lineHeight: 1.4 }}>
            {card.status === 'REJECTED'
              ? 'The claim was refused, so no sponsor rides on it. A logo cannot appear on a clip that isn’t true.'
              : card.sponsor
                ? 'Committed inside the hash above. Swap the sponsor and the hash changes — the swap is detectable.'
                : 'No campaign attached to this claim.'}
          </span>
        </div>
      </div>

      <div className="col" style={{ gap: 6 }}>
        <span className="lbl" style={{ opacity: 0.5 }}>
          PROOF HASH · SHA256
        </span>
        <div className="sunk row" style={{ padding: '9px 10px', alignItems: 'center', gap: 8 }}>
          <LinkIcon size={16} strokeWidth={2.5} />
          <span
            className="mono"
            style={{ flex: 1, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={card.hash}
          >
            {truncateMiddle(card.hash, 10, 10)}
          </span>
          <button
            className="btn"
            onClick={() => {
              try {
                navigator.clipboard.writeText(card.hash)
              } catch {
                /* clipboard unavailable — the hash is still on screen and in `title` */
              }
              setCopied(true)
            }}
            style={{ background: 'var(--paper)', color: 'var(--ink)', padding: '5px 8px', fontSize: 9, boxShadow: '2px 2px 0 var(--ink)' }}
          >
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
        <span className="mono" style={{ fontSize: 9, opacity: 0.6, lineHeight: 1.4 }}>
          Deterministic over the canonical card. Same card → same bytes → same hash.
        </span>
      </div>
    </div>
  )
}

/** One re-checkable coordinate. Mono, label left, value right — a table, not a sentence. */
function Coord({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
      <span className="mono" style={{ fontSize: 9, opacity: 0.55, width: 62, flex: 'none' }}>
        {label}
      </span>
      <span
        className="mono"
        title={value}
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 10,
          fontWeight: 700,
          wordBreak: wrap ? 'break-all' : 'normal',
          lineHeight: 1.35,
        }}
      >
        {value}
      </span>
    </div>
  )
}

function ScoreBox({
  label,
  value,
  colour,
  evidence,
  emptyNote,
}: {
  label: string
  value: number
  colour: string
  evidence: string | null
  emptyNote?: string
}) {
  return (
    <div className="col" style={{ flex: 1, minWidth: 0, border: '3px solid var(--ink)', padding: 10, gap: 2 }}>
      <span className="lbl" style={{ opacity: 0.5, fontSize: 8 }}>
        {label}
      </span>
      <span className="disp" style={{ fontSize: 34, color: colour }}>
        {value}
      </span>
      {/* Show the arithmetic. A score without its evidence is just an opinion. */}
      <span
        className="mono"
        style={{ fontSize: 8, opacity: evidence ? 0.6 : 0.45, lineHeight: 1.35, wordBreak: 'break-word' }}
      >
        {evidence ?? emptyNote ?? '—'}
      </span>
    </div>
  )
}
