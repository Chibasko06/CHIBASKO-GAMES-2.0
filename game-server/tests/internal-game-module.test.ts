import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { Server, Room, ServerError, matchMaker } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { schema, t } from '@colyseus/schema'
import { registerInternalGames } from '../src/games/registerInternalGames.js'
import { createLobbyRoom } from '../src/rooms/LobbyRoom.js'
import { GameSessionCoordinator } from '../src/platform/multiplayer/GameSessionCoordinator.js'
import type { InternalGamePlatform, InternalGameContext, InternalGameClient as GameClient } from '../src/games/sdk/index.js'
import { resolveGame } from '../src/games/registry.js'
import { connectLobby } from '../../lib/lobbyConnection.js'
import { consumeGameReservation } from '../../lib/gameConnection.js'
import type { Reservation } from '../src/platform/multiplayer/GameSessionCoordinator.js'

const definition = { id: 'test-game', roomType: 'test_room', minPlayers: 2, maxPlayers: 2 }
const Player = schema({ userId:t.string(), username:t.string(), avatarUrl:t.string() },'FixturePlayer')
const State = schema({ gameId:t.string().default('test-game'), status:t.string().default('PREPARING'), expectedPlayers:t.number().default(2), answer:t.number().default(-1), players:t.map(Player) },'FixtureState')
async function until(check:()=>boolean) { const end=Date.now()+5000;while(!check()){if(Date.now()>end)throw new Error('Fixture deadline');await delay(10)} }

test('second server module uses unchanged lobby/auth/coordinator and completes without a score or winner', {timeout:10000}, async()=>{
  const registry=new Map([[definition.id,definition]])
  assert.equal(resolveGame('test-game',registry),definition)
  assert.throws(()=>resolveGame('unknown',registry))
  const coordinator=new GameSessionCoordinator()
  let platform: InternalGamePlatform
  class TestRoom extends Room<{state:InstanceType<typeof State>;client:GameClient}> {
    state=new State();private platform!:InternalGameContext
    static async onAuth(){throw new ServerError(403,'PRIVATE_GAME')}
    async onCreate(options:{transitionId:string}){
      this.platform=platform.createContext({transitionId:options.transitionId,roomId:this.roomId,roomType:definition.roomType})
      assert.equal(this.platform.definition.id,'test-game')
      this.maxClients=this.platform.definition.maxPlayers
      this.seatReservationTimeout=this.platform.reservationSeconds
      await this.setMatchmaking({private:true,unlisted:true,locked:true})
      this.onMessage('answer',(client,payload:unknown)=>{
        if(this.platform.getPlayer(client)&&typeof payload==='number'&&Number.isInteger(payload))this.state.answer=payload
      })
    }
    onJoin(client:GameClient){const identity=this.platform.admit(client);const p=new Player();p.userId=identity.userId;p.username=identity.username;p.avatarUrl='';this.state.players.set(client.sessionId,p)}
    admitted(client:GameClient){this.platform.admitted(client)}
    activate(id:string){this.platform.assertCanActivate(id);this.state.status='READY'}
    finishOnServer(){return this.platform.complete({gameId:'test-game',winnerUserId:null,reason:'completed',players:[...this.state.players.values()].map(p=>({userId:p.userId}))})}
    onLeave(client:GameClient){this.state.players.delete(client.sessionId);this.platform.leave(client)}
    onDispose(){this.platform.dispose()}
  }
  const server=new Server({transport:new WebSocketTransport(),greet:false,gracefullyShutdown:false})
  server.define('lobby',createLobbyRoom(async token=>{
    if(!token)throw new Error('Denied');return {userId:token,username:token,avatarUrl:null,expiresAt:Date.now()+60000}
  },coordinator,{registry,startDelayMs:10}))
  registerInternalGames(server,coordinator,[(s,p)=>{platform=p;s.define(definition.roomType,TestRoom).on('join',(room,client)=>room.admitted(client))}])
  const connections:{leave():Promise<unknown>;connection:{isOpen:boolean}}[]=[]
  try {
    await server.listen(0,'127.0.0.1');const address=server.transport.server!.address();assert.ok(address&&typeof address!=='string')
    const endpoint=`http://127.0.0.1:${address.port}`
    const a=await connectLobby('A',undefined,endpoint,'test-game'),b=await connectLobby('B',a.roomId,endpoint,'test-game');connections.push(a,b)
    for(const lobby of [a,b]){lobby.onMessage('game_cancelled',()=>{});lobby.onMessage('lobby_error',()=>{})}
    const offer=(lobby:typeof a)=>new Promise<Reservation>(resolve=>lobby.onMessage('game_reservation',msg=>resolve(msg.reservation)))
    const first=offer(a),second=offer(b)
    a.send('set_ready',{ready:true});b.send('set_ready',{ready:true});await until(()=>a.state.players.get(a.sessionId)?.ready===true&&a.state.players.get(b.sessionId)?.ready===true);a.send('start_game')
    const reservation=await first;assert.equal(reservation.name,'test_room')
    const ga=await consumeGameReservation(reservation,endpoint),gb=await consumeGameReservation(await second,endpoint);connections.push(ga,gb)
    await until(()=>a.state.status==='PLAYING'&&b.state.status==='PLAYING')
    ga.send('answer',2);await until(()=>gb.state.answer===2)
    const game=matchMaker.getLocalRoomById(reservation.roomId) as TestRoom
    assert.equal(game.finishOnServer(),true);assert.equal(game.finishOnServer(),false)
    await until(()=>a.state.status==='RESULTS'&&b.state.status==='RESULTS')
    assert.equal(a.state.winnerUserId,'');assert.equal(a.state.resultReason,'completed')
    a.state.resultPlayers?.forEach(player=>assert.equal(player.hasScore,false))
    a.send('return_to_lobby');await until(()=>a.state.status==='WAITING'&&!matchMaker.getLocalRoomById(reservation.roomId))
  } finally {await Promise.allSettled(connections.filter(c=>c.connection.isOpen).map(c=>c.leave()));await coordinator.shutdown();await server.gracefullyShutdown(false)}
})
