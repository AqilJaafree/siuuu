import type { Metadata, Viewport } from 'next'
import { Archivo_Black, Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

// Self-hosted via next/font. No FOUT, no external request at runtime.
const display = Archivo_Black({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const body = Inter({
  weight: ['400', '600', '700'],
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const mono = JetBrains_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  // App name is always SIUUU. All caps, four Us.
  title: 'SIUUU',
  description: 'World Cup clips, verified against TXLine and anchored on Solana.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FDFBF7',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
