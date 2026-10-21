export type PlayerAudioState=Readonly<{muted:boolean;volume:number}>
export const DEFAULT_AUDIO:PlayerAudioState=Object.freeze({muted:false,volume:1})
export function safeAudio(value:unknown):PlayerAudioState|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null
 const s=value as Record<string,unknown>
 return Object.keys(s).length===2&&typeof s.muted==='boolean'&&typeof s.volume==='number'&&Number.isFinite(s.volume)&&s.volume>=0&&s.volume<=1?Object.freeze({muted:s.muted,volume:s.volume}):null
}
