import './globals.css'
import { AuthProvider } from '@/components/AuthProvider'
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
        <AuthProvider>
          <XpHeartbeat />
          <Navbar />
          <main className="mx-auto max-w-7xl px-4 py-8">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  )
}
