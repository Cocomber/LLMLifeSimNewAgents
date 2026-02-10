import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Life Simulator',
  description: 'Watch AI agents survive, explore, and interact in a procedurally generated world',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
