import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'

const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: { default: 'Cortex', template: '%s \u00b7 Cortex' },
  description: "Your product's living brain.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://cortex-ai-web-rymo.vercel.app'),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${jetbrainsMono.variable} font-sans bg-bg-0 text-text-0 antialiased`}>
        {children}
      </body>
    </html>
  )
}
