import type { Execution, GameLaunchDescriptor } from '../game-distribution/gateway/contracts'

/** Browser wire contract proposal. No game, framework, auth or transport internals. */
export const BRIDGE_CHANNEL='chibasko.game' as const
export const BRIDGE_VERSION=1 as const
export const RUNTIME_POLICY=Object.freeze({descriptorMs:15_000,loadMs:120_000,helloMs:15_000,handshakeMs:5_000,gameReadyMs:600_000,
  pingMs:10_000,pongMs:30_000,leaseRenewMs:300_000,leaseRetryMs:30_000,leaseRequestMs:15_000,
  sessionSeconds:1800,maxIssuePerMinute:60,maxAnonymousPerMinute:600})
export type RuntimePolicy={readonly [Key in keyof typeof RUNTIME_POLICY]:number}
/** Platform-only configuration, never supplied by a game's manifest or messages. */
export function runtimePolicy(overrides:Partial<RuntimePolicy>={}) {
  const policy:RuntimePolicy={...RUNTIME_POLICY,...overrides}
  const maximums={descriptorMs:60_000,loadMs:600_000,helloMs:60_000,handshakeMs:60_000,gameReadyMs:1_800_000,
    pingMs:60_000,pongMs:120_000,leaseRenewMs:600_000,leaseRetryMs:60_000,leaseRequestMs:60_000}
  for(const key of Object.keys(maximums) as (keyof typeof maximums)[])
    if(!Number.isSafeInteger(policy[key]) || policy[key]<1 || policy[key]>maximums[key])throw new RuntimeError('invalid_runtime_policy')
  return policy
}
export type RuntimePhase='resolving'|'launching'|'loading'|'ready'|'running'|'failed'|'closed'
export type RuntimeState=Readonly<{phase:RuntimePhase;error?:string}>
export type LaunchRequest=Readonly<{gameId:string;gameVersionId:string;execution:Execution;audience:'published'|'preview';locale:string;onlineSessionReference?:string}>
export type SafeLaunchContext=Readonly<{
  gameId:string;gameVersionId:string;execution:Execution;locale:string
  participants:readonly Readonly<{participantId:string;username:string}>[]
  session?:Readonly<{sessionId:string;localParticipantIds:readonly string[]}>
}>
export type RuntimeLaunchDescriptor=GameLaunchDescriptor & Readonly<{
  launchId:string;generation:string;expiresAt:string;bridgeVersion:1
  iframeProfile:'web-v1'|'web-isolated-v1'|'web-legacy-v1';context:SafeLaunchContext
}>
/** Portal-only handle. controlToken never reaches iframe/SDK or URL. */
export type LaunchHandle={descriptor:RuntimeLaunchDescriptor;controlToken:string}
export type LaunchLease=Readonly<{launchId:string;generation:string;expiresAt:string}>
export type LaunchClient={create(request:LaunchRequest,signal:AbortSignal):Promise<LaunchHandle>;renew(handle:LaunchHandle,signal:AbortSignal):Promise<LaunchLease>;release(handle:LaunchHandle):Promise<void>}
export type GameMessageType='GAME_HELLO'|'GAME_READY'|'LEAVE_REQUEST'|'GAME_ERROR'|'GAME_PONG'
export type BridgeMessage={channel:typeof BRIDGE_CHANNEL;protocolVersion:1;launchId:string;generation:string;type:string;payload:Record<string,unknown>}
export class RuntimeError extends Error {constructor(readonly code:string){super(code);this.name='RuntimeError'}}

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function objectWithKeys(value:unknown,keys:readonly string[]):value is Record<string,unknown> {
  return !!value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k))
}
export function safeContext(value:unknown):value is SafeLaunchContext {
  if(!value || typeof value!=='object')return false
  const c=value as SafeLaunchContext,keys=['gameId','gameVersionId','execution','locale','participants',...(Object.hasOwn(c,'session')?['session']:[])]
  if(!objectWithKeys(c,keys) || !uuid.test(c.gameId) || !uuid.test(c.gameVersionId) || !['local','online'].includes(c.execution)
    || typeof c.locale!=='string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(c.locale) || !Array.isArray(c.participants) || c.participants.length>64)return false
  const ids=new Set<string>()
  for(const p of c.participants){if(!objectWithKeys(p,['participantId','username']) || typeof p.participantId!=='string' || !/^p_[a-f0-9]{32,64}$/.test(p.participantId)
    || typeof p.username!=='string' || p.username.length<1 || p.username.length>80 || /[\u0000-\u001f\u007f]/.test(p.username) || ids.has(p.participantId))return false;ids.add(p.participantId)}
  if(c.execution==='local')return !c.session
  return !!c.session && objectWithKeys(c.session,['sessionId','localParticipantIds']) && typeof c.session.sessionId==='string'
    && /^s_[a-f0-9]{32,64}$/.test(c.session.sessionId) && Array.isArray(c.session.localParticipantIds)
    && c.session.localParticipantIds.length>0 && new Set(c.session.localParticipantIds).size===c.session.localParticipantIds.length
    && c.session.localParticipantIds.every(id=>ids.has(id))
}
export function validGameMessage(data:unknown):data is BridgeMessage {
  if(!objectWithKeys(data,['channel','protocolVersion','launchId','generation','type','payload']) || data.channel!==BRIDGE_CHANNEL
    || data.protocolVersion!==1 || typeof data.launchId!=='string' || !uuid.test(data.launchId) || typeof data.generation!=='string' || !uuid.test(data.generation))return false
  const keys=data.type==='GAME_ERROR'?['documentId','code']:data.type==='GAME_PONG'?['documentId','sequence']:['documentId']
  if(!['GAME_HELLO','GAME_READY','LEAVE_REQUEST','GAME_ERROR','GAME_PONG'].includes(String(data.type)) || !objectWithKeys(data.payload,keys)
    || typeof data.payload.documentId!=='string' || !uuid.test(data.payload.documentId))return false
  if(data.type==='GAME_ERROR')return typeof data.payload.code==='string' && /^[a-z][a-z0-9_]{0,63}$/.test(data.payload.code)
  return data.type!=='GAME_PONG' || (Number.isSafeInteger(data.payload.sequence) && Number(data.payload.sequence)>0)
}
