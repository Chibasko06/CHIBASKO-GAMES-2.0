'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import GameRuntime from '@/components/game-runtime/GameRuntime'
import { httpLaunchClient } from '@/lib/game-runtime/client'
import { lobbyClient } from '@/lib/multiplayer-lobby/client'
import { LOBBY_UI_POLICY, type DirectoryLobby, type LobbySnapshot, type LobbyAccess } from '@/lib/multiplayer-lobby/contracts'
import { multiplayerButton, AuthInvitation } from './MultiplayerEntry'

type Props={gameId:string;slug:string;access:LobbyAccess;lobbyId?:string}
export default function DurableLobby(props:Props) {
 const {session,loading}=useAuth()
 if(loading)return <p role="status">Vérification de la connexion…</p>
 if(!session)return <AuthInvitation next={`/games/${props.slug}/${props.access==='public'?'online':'private'}`} />
 return <AuthenticatedLobby key={session.user.id} {...props} token={session.access_token} />
}
function AuthenticatedLobby({gameId,slug,access,lobbyId,token}:Props & {token:string}) {
 const router=useRouter()
 const request=useMemo(()=>lobbyClient(async()=>token),[token])
 const launchClient=useMemo(()=>httpLaunchClient(async()=>token),[token])
 const [lobby,setLobby]=useState<LobbySnapshot|null>(null),[items,setItems]=useState<DirectoryLobby[]>([])
 const [cursor,setCursor]=useState<string|null>(null),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const mutation=useRef<AbortController|null>(null)
 useEffect(()=>()=>mutation.current?.abort(),[token])
 useEffect(()=>{
  if(!token)return
  let disposed=false,timer:ReturnType<typeof setTimeout>|undefined
  const abort=new AbortController()
  async function poll(){
   try {
    if(lobbyId){const next=await request<LobbySnapshot>('lobbies/'+lobbyId,undefined,abort.signal);if(next.gameId!==gameId)throw Error('wrong_game');if(!disposed)setLobby(previous=>previous?.id===next.id && previous.revision>next.revision?previous:next)}
    else if(access==='public'){
     const next=await request<{items:DirectoryLobby[];nextCursor:string|null}>('games/'+gameId+'/lobbies',undefined,abort.signal)
     if(!disposed){setItems(next.items);setCursor(next.nextCursor)}
    }
   }catch{if(!disposed)setError('Le salon est temporairement indisponible. Nouvelle tentative en cours…')}
   finally{if(!disposed)timer=setTimeout(poll,(document.hidden?LOBBY_UI_POLICY.hiddenPollMs:LOBBY_UI_POLICY.pollMs)*(1+Math.random()*0.1))}
  }
  void poll()
  return()=>{disposed=true;abort.abort();clearTimeout(timer)}
 },[request,token,lobbyId,gameId,access])
 async function action(path:string,body:Record<string,unknown>={}) {
  mutation.current?.abort();const abort=new AbortController();mutation.current=abort
  setBusy(true);setError('')
  try {
   const next=await request<LobbySnapshot>(path,body,abort.signal)
   if(abort.signal.aborted)return
   if(path.endsWith('/leave')){router.push('/games/'+slug);return}
   if(!lobbyId)router.push(`/games/${slug}/lobby/${next.id}`)
   else setLobby(previous=>previous?.id===next.id && previous.revision>next.revision?previous:next)
  }catch{if(!abort.signal.aborted)setError('Cette action n’est pas disponible. Vérifie les places et l’état du salon.')}
  finally{if(!abort.signal.aborted)setBusy(false)}
 }
 async function more(){if(!cursor)return;try{
  const next=await request<{items:DirectoryLobby[];nextCursor:string|null}>(`games/${gameId}/lobbies?after=${cursor}`)
  setItems(current=>[...new Map([...current,...next.items].map(item=>[item.id,item])).values()]);setCursor(next.nextCursor)
 }catch{setError('La liste des salons est temporairement indisponible.')}}
 const self=lobby?.members.find(member=>member.self)
 return <section className="space-y-5 rounded-2xl border border-cyan-900 p-5" aria-label="Salon multijoueur">
  {error && <p role="alert">{error}</p>}
  {!lobbyId?<>
   <button className={multiplayerButton} disabled={busy} onClick={()=>void action('lobbies',{gameId,access,requestId:crypto.randomUUID()})}>Créer un salon {access==='public'?'public':'privé'}</button>
   {access==='private'?<form onSubmit={event=>{event.preventDefault();void action('lobbies/join-code',{gameId,code})}}>
    <label>Code privé<input className="m-2 rounded bg-zinc-900 p-2" value={code} onChange={event=>setCode(event.target.value)} maxLength={20} autoComplete="off" /></label>
    <button className={multiplayerButton} disabled={busy}>Rejoindre</button>
   </form>:<><ul aria-label="Salons publics">{items.map(item=><li key={item.id} className="my-3 flex justify-between gap-3"><span>{item.currentPlayers} / {item.maxPlayers} joueurs</span><button className={multiplayerButton} disabled={busy} onClick={()=>void action(`lobbies/${item.id}/join`)}>Rejoindre</button></li>)}</ul>{cursor && <button className={multiplayerButton} onClick={()=>void more()}>Autres salons</button>}</>}
  </>:!lobby?<p role="status">Chargement du salon…</p>:<>
   <p role="status">{lobby.status} · {lobby.members.length} / {lobby.maxPlayers} joueurs</p>
   {lobby.access==='private' && <p>Code privé : <strong className="break-all font-mono">{lobby.code}</strong></p>}
   <ul>{lobby.members.map(member=><li key={member.id}>{member.displayName}{member.self?' (toi)':''}{member.leader?' · Hôte':''} · {member.ready?'Prêt':'Pas prêt'}</li>)}</ul>
   {lobby.status==='waiting' && <div className="flex flex-wrap gap-3"><button className={multiplayerButton} disabled={busy} onClick={()=>void action(`lobbies/${lobby.id}/ready`,{ready:!self?.ready})}>{self?.ready?'Annuler prêt':'Je suis prêt'}</button>
    {self?.leader && <button className={multiplayerButton} disabled={busy || lobby.members.length<lobby.minPlayers || lobby.members.some(member=>!member.ready)} onClick={()=>void action(`lobbies/${lobby.id}/start`)}>Lancer la partie</button>}</div>}
   {['starting','playing'].includes(lobby.status) && lobby.onlineSessionReference && <GameRuntime key={lobby.onlineSessionReference} gameId={lobby.gameId} gameVersionId={lobby.gameVersionId} execution="online" audience="published" locale="fr" onlineSessionReference={lobby.onlineSessionReference} client={launchClient} onLeave={()=>void action(`lobbies/${lobby.id}/leave`)} />}
   {lobby.status==='results' && <p>La partie est terminée.</p>}
   {lobby.status==='results' && self?.leader && <button className={multiplayerButton} disabled={busy} onClick={()=>void action(`lobbies/${lobby.id}/replay`)}>Retour au salon</button>}
   <button className={multiplayerButton} disabled={busy} onClick={()=>void action(`lobbies/${lobby.id}/leave`)}>Quitter le salon</button>
  </>}
 </section>
}
