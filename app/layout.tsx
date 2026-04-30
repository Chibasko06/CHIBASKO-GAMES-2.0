import './globals.css'
import { Navbar } from '@/components/Navbar'
import Footer from '@/components/Footer'
import XpHeartbeat from '@/components/XpHeartbeat'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className="bg-zinc-950 text-white">
        <XpHeartbeat />
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 py-8">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}
