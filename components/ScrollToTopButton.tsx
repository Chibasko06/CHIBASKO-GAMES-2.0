"use client";

import { useEffect, useState } from 'react'

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 480)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Remonter en haut"
      className={`fixed bottom-5 left-1/2 z-[70] flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border border-cyan-700/80 bg-zinc-950/95 text-cyan-200 shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition-all duration-300 hover:bg-zinc-900 sm:bottom-6 ${
        visible
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <span className="text-xl font-black">↑</span>
    </button>
  )
}
