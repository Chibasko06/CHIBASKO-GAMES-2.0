export type LobbyAccess='public'|'private'
export type LobbySnapshot={
 id:string;gameId:string;gameVersionId:string;access:LobbyAccess;code:string
 status:'waiting'|'starting'|'playing'|'results'|'closed';minPlayers:number;maxPlayers:number
 startPolicy:'manual'|'when_full';revision:number;expiresAt:string;onlineSessionReference:string|null
 members:{id:string;displayName:string;self:boolean;leader:boolean;ready:boolean}[]
}
export type DirectoryLobby=Pick<LobbySnapshot,'id'|'gameId'|'gameVersionId'|'maxPlayers'> & {currentPlayers:number}
export const LOBBY_UI_POLICY=Object.freeze({pollMs:5000,hiddenPollMs:30000,requestMs:15000,pageSize:25})
export class LobbyError extends Error {
 constructor(readonly code:string,readonly status=400){super(code);this.name='LobbyError'}
}
