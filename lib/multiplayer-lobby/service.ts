import type { UploadRepository } from '../game-distribution/uploads/contracts'
import { LobbyError, type LobbySnapshot, type DirectoryLobby, type LobbyAccess } from './contracts'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function lobbyId(value:unknown):asserts value is string {
 if(typeof value!=='string' || !uuid.test(value))throw new LobbyError('invalid_request')
}
export function privateLobbyCode(value:unknown) {
 if(typeof value!=='string')throw new LobbyError('invalid_request')
 const code=value.trim().toUpperCase()
 if(!/^[A-F0-9]{20}$/.test(code))throw new LobbyError('invalid_request')
 return code
}
/** Instances share no directory, membership, seat reservation or session state. */
export function multiplayerLobbyService(db:UploadRepository,available?:(gameId:string,access:LobbyAccess)=>Promise<boolean>) {
 async function limit(actor:string,operation:string) {
  if(!actor)throw new LobbyError('unauthorized',401)
  lobbyId(actor)
  // Separate committed RPC: rejected joins and code guesses still consume their quota.
  if(!await db.call<boolean>('distribution_multiplayer_limit',{p_actor:actor,p_operation:operation}))throw new LobbyError('rate_limited',429)
 }
 return {
  async create(actor:string,gameId:string,access:LobbyAccess,requestId:string) {
   lobbyId(gameId);lobbyId(requestId)
   if(!['public','private'].includes(access))throw new LobbyError('invalid_request')
   await limit(actor,'create')
   if(available && !await available(gameId,access))throw new LobbyError('deployment_unavailable',409)
   return db.call<LobbySnapshot>('distribution_multiplayer_create',{p_actor:actor,p_game:gameId,p_access:access,p_request:requestId})
  },
  async get(actor:string,id:string){lobbyId(id);await limit(actor,'get');return db.call<LobbySnapshot>('distribution_multiplayer_snapshot',{p_actor:actor,p_id:id})},
  async list(actor:string,gameId:string,after?:string) {
   lobbyId(gameId);if(after)lobbyId(after);await limit(actor,'list')
   const items=await db.call<DirectoryLobby[]>('distribution_multiplayer_list',{p_actor:actor,p_game:gameId,p_after:after??null})
   return {items,nextCursor:items.length===25?items.at(-1)!.id:null}
  },
  async joinCode(actor:string,gameId:string,value:string){lobbyId(gameId);const code=privateLobbyCode(value);await limit(actor,'lookup');return db.call<LobbySnapshot>('distribution_multiplayer_lookup',{p_actor:actor,p_game:gameId,p_code:code})},
  async mutate(actor:string,id:string,action:'join'|'leave'|'ready'|'start'|'replay',ready=false) {
   lobbyId(id)
   if(!['join','leave','ready','start','replay'].includes(action) || typeof ready!=='boolean')throw new LobbyError('invalid_request')
   await limit(actor,action)
   return action==='start'?db.call<LobbySnapshot>('distribution_multiplayer_start',{p_actor:actor,p_id:id}):
    db.call<LobbySnapshot & {left?:boolean}>('distribution_multiplayer_mutate',{p_actor:actor,p_id:id,p_action:action,p_ready:ready})
  },
 }
}
