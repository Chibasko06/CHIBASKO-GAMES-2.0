export type GameStartContext = Readonly<{execution:'local'}> | Readonly<{execution:'online';online:Readonly<{
 onlineSessionId:string;participantId:string;server:Readonly<{endpoint:string;ticket:string;expiresAt:string}>
}>}>
export type GameServerDeployment=Readonly<{id:string;gameId:string;hostingMode:'self_hosted'|'chibasko_hosted';endpoint:string;status:'active'|'disabled';region?:string}>
export type TicketClaims=Readonly<{gameId:string;gameVersionId:string;onlineSessionId:string;participant:Readonly<{id:string;displayName:string}>}>
export class OnlineSessionError extends Error {constructor(readonly code:string,readonly status:number){super(code);this.name='OnlineSessionError'}}
