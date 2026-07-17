'use client'

import type { VerifyStatus } from '../src/verify/types.js'
import { STATUS_FILL, pillClass } from '../app/lib/format.js'

/**
 * Every badge is tappable and opens the Proof Card. No exceptions — a claim without
 * reachable evidence is decoration, and decoration is a lie here.
 *
 * There is deliberately no non-interactive variant of this component. The only way
 * to render a status is to render a way to check it.
 */
export function StatusPill({
  status,
  onOpen,
  size = 'md',
  className,
  style,
}: {
  status: VerifyStatus
  onOpen: () => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
  style?: React.CSSProperties
}) {
  const sizing =
    size === 'sm'
      ? { fontSize: 8, padding: '3px 8px' }
      : size === 'lg'
        ? { fontSize: 12, padding: '7px 14px' }
        : { fontSize: 10.5, padding: '5px 11px' }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${pillClass(status)} ${className ?? ''}`}
      // Never colour alone: the text label is inside the badge, so a colourblind
      // viewer reads VERIFIED rather than green.
      aria-label={`${status} — open proof card`}
      style={{ background: STATUS_FILL[status], ...sizing, ...style }}
    >
      {status}
    </button>
  )
}
