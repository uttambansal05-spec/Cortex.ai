import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Cortex', template: '%s · Cortex' },
  description: 'Your product\'s living brain.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://cortex-omega-one.vercel.app'),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans bg-background text-foreground antialiased`}>
        {children}
      </body>
    </html>
  )
}
