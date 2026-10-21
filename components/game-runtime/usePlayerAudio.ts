'use client'
import {useSyncExternalStore} from 'react'
import {DEFAULT_AUDIO,safeAudio,type PlayerAudioState} from '@/lib/game-runtime/audio'
const key='chibasko.player.audio.v1',listeners=new Set<()=>void>()
let state:PlayerAudioState=DEFAULT_AUDIO
function notify(){for(const listener of listeners)listener()}
function read(){try{const stored=safeAudio(JSON.parse(localStorage.getItem(key)??'null'));if(stored&&(stored.muted!==state.muted||stored.volume!==state.volume)){state=stored;notify()}}catch{/* Storage is optional. */}}
function subscribe(listener:()=>void){listeners.add(listener);if(listeners.size===1){read();window.addEventListener('storage',read)}return()=>{listeners.delete(listener);if(!listeners.size)window.removeEventListener('storage',read)}}
export function setPlayerAudio(next:PlayerAudioState){const valid=safeAudio(next);if(!valid)return;state=valid;try{localStorage.setItem(key,JSON.stringify(state))}catch{/* Keep the in-memory preference. */}notify()}
export function usePlayerAudio(){const audio=useSyncExternalStore(subscribe,()=>state,()=>DEFAULT_AUDIO);return {audio,setAudio:setPlayerAudio,toggle:()=>setPlayerAudio({...state,muted:!state.muted})}}
