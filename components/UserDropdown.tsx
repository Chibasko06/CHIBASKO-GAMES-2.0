"use client";

import Image from 'next/image'
import { useId,useLayoutEffect,useRef,useState } from 'react'
import Link from 'next/link'
import {createPortal} from 'react-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export default function UserDropdown({
  user,
  isAdmin,
  avatarUrl,
}: {
  user: User
  isAdmin: boolean
  avatarUrl?: string | null
}) {
  const trigger=useRef<HTMLButtonElement>(null)
  const menu=useRef<HTMLDivElement>(null)
  const [position,setPosition]=useState({left:0,top:0,width:224})
  const menuId=useId()
  const [open, setOpen] = useState(false)

  useLayoutEffect(()=>{
    if(!open)return
    const button=trigger.current!,document=button.ownerDocument,view=document.defaultView!
    let frame=0
    const update=()=>{
      frame=0
      const anchor=button.getBoundingClientRect()
      if(!anchor.width || anchor.bottom<=0 || anchor.top>=view.innerHeight){setOpen(false);return}
      const width=Math.min(224,view.innerWidth-24)
      const height=menu.current?.getBoundingClientRect().height??180
      const left=Math.max(12,Math.min(anchor.right-width,view.innerWidth-width-12))
      const below=anchor.bottom+8
      const top=Math.max(12,Math.min(below+height<=view.innerHeight-12?below:anchor.top-height-8,view.innerHeight-height-12))
      setPosition(previous=>previous.left===left && previous.top===top && previous.width===width?previous:{left,top,width})
    }
    const schedule=()=>{if(!frame)frame=view.requestAnimationFrame(update)}
    const outside=(event:Event)=>{if(event.target instanceof Node && !button.contains(event.target) && !menu.current?.contains(event.target))setOpen(false)}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);button.focus({preventScroll:true})}}
    const observer=new ResizeObserver(schedule)
    observer.observe(button)
    if(menu.current)observer.observe(menu.current)
    update()
    menu.current?.querySelector<HTMLElement>('a,button')?.focus({preventScroll:true})
    view.addEventListener('resize',schedule)
    view.addEventListener('scroll',schedule,true)
    view.visualViewport?.addEventListener('resize',schedule)
    view.visualViewport?.addEventListener('scroll',schedule)
    document.addEventListener('pointerdown',outside,true)
    document.addEventListener('focusin',outside)
    document.addEventListener('keydown',escape)
    return()=>{
      if(frame)view.cancelAnimationFrame(frame)
      observer.disconnect()
      view.removeEventListener('resize',schedule)
      view.removeEventListener('scroll',schedule,true)
      view.visualViewport?.removeEventListener('resize',schedule)
      view.visualViewport?.removeEventListener('scroll',schedule)
      document.removeEventListener('pointerdown',outside,true)
      document.removeEventListener('focusin',outside)
      document.removeEventListener('keydown',escape)
    }
  },[open])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="relative">
      <button
        ref={trigger} type="button" aria-label="Mon compte" aria-expanded={open} aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full bg-zinc-900 border border-cyan-900 px-3 py-1 hover:bg-zinc-800 transition"
      >
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-cyan-700 bg-cyan-600 text-[10px] font-black text-black">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt="Avatar compte"
              width={32}
              height={32}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            user.email?.[0]?.toUpperCase() ?? 'J'
          )}
        </div>
        <span className="text-[10px] font-bold text-white uppercase hidden md:block">
          Mon Compte
        </span>
      </button>

      {open && createPortal(
        <div ref={menu} id={menuId} style={{position:'fixed',...position,maxHeight:'calc(100dvh - 24px)',overflowY:'auto'}} role="navigation" aria-label="Menu du compte" className="account-dropdown overflow-hidden rounded-[20px] border border-cyan-900 bg-zinc-950 shadow-[0_10px_20px_rgba(0,0,0,0.5)]">
          <Link
            href="/dashboard"
            className="block px-4 py-2 text-xs font-bold text-zinc-400 hover:text-cyan-400 hover:bg-zinc-900 border-b border-zinc-900"
            onClick={() => setOpen(false)}
          >
            TABLEAU DE BORD
          </Link>
          <Link
            href="/favorites"
            className="block px-4 py-2 text-xs font-bold text-zinc-400 hover:text-cyan-400 hover:bg-zinc-900 border-b border-zinc-900"
            onClick={() => setOpen(false)}
          >
            MES FAVORIS
          </Link>
          {isAdmin ? (
            <Link
              href="/admin"
              className="block px-4 py-2 text-xs font-bold text-cyan-300 hover:text-cyan-200 hover:bg-zinc-900 border-b border-zinc-900"
              onClick={() => setOpen(false)}
            >
              ESPACE ADMIN
            </Link>
          ) : null}
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-zinc-900"
          >
            DECONNEXION
          </button>
        </div>,document.body
      )}
    </div>
  )
}
