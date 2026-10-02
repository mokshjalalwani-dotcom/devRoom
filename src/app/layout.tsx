import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ToastContainer } from '../components/Toast'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Temporal Dev Room',
  description: 'Dump it. Debug it. Forget it. Temporary, real-time workspace for developers.',
  openGraph: {
    title: 'Temporal Dev Room',
    description: 'Temporary, real-time workspace where developers dump anything from a debugging session and see it instantly on any device.',
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            try {
              const t = localStorage.getItem('theme')
              const d = window.matchMedia('(prefers-color-scheme: dark)').matches
              document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : t === 'dark' ? 'dark' : d ? 'dark' : 'light')
            } catch (_) {}
          `
        }} />
      </head>
      <body className={`${inter.variable} ${mono.variable} font-sans min-h-screen selection:bg-blue-500/30`}>
        {children}
        <ToastContainer />
      </body>
    </html>
  )
}
