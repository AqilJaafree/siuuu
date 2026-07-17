'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ShieldCheck } from 'lucide-react'
import { verifyCase, type PipelineStep } from '../app/actions.js'
import type { DemoCase, FeedClip } from '../app/lib/feed.js'

/** The three sponsor logos are real files in public/. */
const SPONSORS = [
  { id: 'adidas', name: 'adidas', src: '/adidas.png' },
  { id: 'nike', name: 'Nike', src: '/nike-logo.png' },
  { id: 'stmy', name: 'STMY', src: '/stmy.png' },
]

const STEP_NAMES = [
  'Load capture',
  'Build timeline',
  'Match the feed',
  'Score the drama',
  'Build the proof',
  'State the tier',
]

export function ClipScreen({
  cases,
  onVerified,
}: {
  cases: DemoCase[]
  onVerified: (clip: FeedClip) => void
}) {
  const [claimId, setClaimId] = useState<string>(cases[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [sponsor, setSponsor] = useState<string | null>(null)

  const [verifying, setVerifying] = useState(false)
  const [step, setStep] = useState(0)
  const [steps, setSteps] = useState<PipelineStep[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const result = useRef<FeedClip | null>(null)

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), [])

  async function post() {
    if (verifying || !claimId) return
    setVerifying(true)
    setStep(0)
    setSteps(null)
    setError(null)
    result.current = null

    // The real engine runs first. The stepping below reveals a pipeline that has
    // already genuinely completed — it never animates ahead of the result and then
    // backfills it.
    // The sponsor travels with the claim: it is part of the canonical card and lands
    // inside the proof hash, so the card commits to which brand rides on it.
    const res = await verifyCase(claimId, sponsor)
    if ('error' in res) {
      setError(res.error)
      setVerifying(false)
      return
    }
    setSteps(res.steps)
    result.current = res.clip
    setStep(1)

    timer.current = setInterval(() => {
      setStep((s) => {
        if (s >= 6) {
          if (timer.current) clearInterval(timer.current)
          return s
        }
        return s + 1
      })
    }, 420)
  }

  function done() {
    if (result.current) onVerified(result.current)
    setVerifying(false)
    setStep(0)
    setSteps(null)
    setTitle('')
    setDesc('')
    setSponsor(null)
  }

  return (
    <div className="col" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottom: '3px solid var(--ink)' }}
      >
        <span className="disp" style={{ fontSize: 22, letterSpacing: '-.5px' }}>
          SIUUU
        </span>
        <span className="lbl" style={{ fontSize: 12 }}>
          NEW CLIP
        </span>
      </div>

      {verifying ? (
        <Verifying steps={steps} current={step} onDone={done} />
      ) : (
        <>
          <div className="col" style={{ flex: 1, padding: 16, gap: 14, overflowY: 'auto' }}>
            {/* No upload backend and no OCR. Rather than a file picker that leads
                nowhere, the clipper names the moment they are claiming — which is
                the input the engine actually takes. */}
            <div className="col" style={{ gap: 5 }}>
              <span className="lbl" style={{ opacity: 0.5 }}>
                THE MOMENT YOU ARE CLAIMING
              </span>
              <div className="col" style={{ gap: 8 }}>
                {cases.map((c) => {
                  const on = claimId === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => setClaimId(c.id)}
                      className="col"
                      style={{
                        border: '3px solid var(--ink)',
                        background: on ? 'var(--ink)' : 'var(--card)',
                        color: on ? 'var(--paper)' : 'var(--ink)',
                        boxShadow: on ? '4px 4px 0 var(--impact)' : '4px 4px 0 var(--ink)',
                        padding: 10,
                        gap: 4,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'transform 90ms ease-out, box-shadow 90ms ease-out',
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 12 }}>{c.title}</span>
                      <span className="mono" style={{ fontSize: 9, opacity: 0.7 }}>
                        {c.fixtureId} · {c.clockStart}–{c.clockEnd}s · {c.claimKind}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="col" style={{ gap: 5 }}>
              <span className="lbl" style={{ opacity: 0.5 }}>
                TITLE
              </span>
              <input
                className="inp"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Phantom equaliser, 24:32"
              />
            </div>

            <div className="col" style={{ gap: 5 }}>
              <span className="lbl" style={{ opacity: 0.5 }}>
                DESCRIPTION
              </span>
              <textarea
                className="inp"
                rows={2}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="what the ref actually saw…"
              />
            </div>

            <div className="col" style={{ gap: 7 }}>
              <span className="lbl" style={{ color: 'var(--sponsor)' }}>
                SPONSOR CAMPAIGN
              </span>
              <div className="row" style={{ gap: 8 }}>
                {SPONSORS.map((sp) => (
                  <button
                    key={sp.id}
                    className={`chip ${sponsor === sp.id ? 'on' : ''}`}
                    onClick={() => setSponsor((v) => (v === sp.id ? null : sp.id))}
                    aria-pressed={sponsor === sp.id}
                    style={{ flex: 1, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 5 }}
                  >
                    {/* The logos are black marks. `.chip.on` fills violet, which would
                        swallow them — so the mark sits on its own white plate and the
                        violet fill stays legible as the active state. Contain, never
                        squash: the three marks have different intrinsic ratios. */}
                    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff' }}>
                      <Image src={sp.src} alt={sp.name} fill sizes="80px" style={{ objectFit: 'contain', padding: 3 }} />
                    </div>
                  </button>
                ))}
              </div>
              {/* The choice is now bound into the hash, which is a real and checkable
                  claim. The escrow still does not exist, and saying otherwise here
                  would be the overclaim — so state exactly which half is true. */}
              <span className="mono" style={{ fontSize: 9, opacity: 0.6, lineHeight: 1.4 }}>
                Goes inside the proof hash — swap it and the hash changes. A refused claim
                carries no sponsor. No escrow is committed; no money moves yet.
              </span>
            </div>

            {error && (
              <div className="sunk col" style={{ padding: 10, gap: 3, borderColor: 'var(--overturned)' }}>
                <span className="lbl" style={{ color: 'var(--overturned)' }}>
                  VERIFICATION FAILED
                </span>
                <span className="mono" style={{ fontSize: 10 }}>
                  {error}
                </span>
              </div>
            )}
          </div>

          <div className="col" style={{ padding: '14px 16px', borderTop: '3px solid var(--ink)' }}>
            <button
              className="btn"
              onClick={post}
              disabled={!claimId}
              style={{ background: 'var(--ink)', color: 'var(--paper)', height: 50, boxShadow: '4px 4px 0 var(--sponsor)' }}
            >
              <span className="lbl" style={{ fontSize: 14, color: 'var(--paper)' }}>
                POST
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Six discrete steps. No indeterminate spinners — a spinner says "something is
 * happening, trust us", which is the opposite of this product. Each step lands with
 * a hard state change, and a step is allowed to land REJECTED.
 */
function Verifying({
  steps,
  current,
  onDone,
}: {
  steps: PipelineStep[] | null
  current: number
  onDone: () => void
}) {
  const finished = !!steps && current >= 6
  const rejected = steps?.some((s) => s.state === 'REJECTED')

  return (
    <div className="col" style={{ flex: 1, padding: 16, gap: 12, overflowY: 'auto' }}>
      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
        <ShieldCheck size={22} strokeWidth={2.5} />
        <span className="lbl" style={{ fontSize: 13 }}>
          VERIFYING CLIP
        </span>
      </div>

      <div className="row" style={{ gap: 5 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => {
          const st = steps?.[i - 1]
          const landed = i < current || (i === current && finished)
          const bg = !landed
            ? i === current
              ? 'var(--pending)'
              : 'var(--rejected)'
            : st?.state === 'REJECTED'
              ? 'var(--overturned)'
              : 'var(--verified)'
          return <div key={i} style={{ flex: 1, height: 12, border: '2px solid var(--ink)', background: bg }} />
        })}
      </div>

      {/* Live region: step transitions are announced. */}
      <div className="col" style={{ marginTop: 4 }} aria-live="polite">
        {STEP_NAMES.map((name, idx) => {
          const i = idx + 1
          const real = steps?.[idx]
          const state = i < current || (i === current && finished) ? 'landed' : i === current ? 'run' : 'wait'
          const badge =
            state === 'landed' ? (real?.state ?? 'DONE') : state === 'run' ? 'RUNNING' : 'WAITING'
          const badgeBg =
            state === 'landed'
              ? real?.state === 'REJECTED'
                ? 'var(--overturned)'
                : 'var(--verified)'
              : state === 'run'
                ? 'var(--pending)'
                : 'var(--rejected)'

          return (
            <div
              key={name}
              className="col"
              style={{
                padding: '10px 4px',
                borderBottom: '1px solid rgba(128,128,128,.25)',
                opacity: state === 'wait' ? 0.4 : 1,
                background: state === 'run' ? 'var(--sunk)' : 'transparent',
                gap: 3,
              }}
            >
              <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                <span className="mono" style={{ width: 20, fontWeight: 700 }}>
                  {i}
                </span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 12 }}>{name}</span>
                <span
                  // WAITING sits on the neutral fill, which flips with the theme —
                  // it needs the theme's ink, same as a REJECTED badge.
                  className={`pill ${state === 'wait' ? 'pill--neutral' : ''}`}
                  style={{ background: badgeBg, fontSize: 8, padding: '4px 8px', cursor: 'default' }}
                >
                  {badge}
                </span>
              </div>
              {state === 'landed' && real && (
                <span className="mono" style={{ fontSize: 9, opacity: 0.65, paddingLeft: 30 }}>
                  {real.detail}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {finished && (
        <div className="col" style={{ gap: 10, marginTop: 4 }}>
          {rejected && (
            <div className="col" style={{ border: '3px solid var(--ink)', padding: 10, gap: 4 }}>
              <span className="lbl" style={{ opacity: 0.5 }}>
                OUTCOME
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>
                The claim was refused. The clip still posts — with the refusal attached.
              </span>
            </div>
          )}
          <button
            className="btn"
            onClick={onDone}
            style={{ background: 'var(--ink)', color: 'var(--paper)', height: 46 }}
          >
            <span className="lbl" style={{ fontSize: 13, color: 'var(--paper)' }}>
              OPEN THE PROOF
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
