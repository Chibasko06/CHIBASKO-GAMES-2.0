import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { Server, Room, ServerError, matchMaker } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { schema, t } from '@colyseus/schema'
import { registerInternalGames } from '../src/games/registerInternalGames.js'
import { createLobbyRoom } from '../src/rooms/LobbyRoom.js'
import { GameSessionCoordinator } from '../src/platform/multiplayer/GameSessionCoordinator.js'
import { GameAdmission, type GameClient } from '../src/platform/multiplayer/GameAdmission.js'
import { resolveGame } from '../src/games/registry.js'
import { connectLobby } from '../../lib/lobbyConnection.js'
import { consumeGameReservation } from '../../lib/gameConnection.js'
import type { Reservation } from '../src/platform/multiplayer/GameSessionCoordinator.js'

const definition = { id: 'test-game', roomType: 'test_room', minPlayers: 2, maxPlayers: 2 }
const Player = schema({ userId:t.string(), username:t.string(), avatarUrl:t.string() },'FixturePlayer')
const State = schema({ gameId:t.string().default('test-game'), status:t.string().default('PREPARING'), expectedPlayers:t.number().default(2), players:t.map(Player) },'FixtureState')
async function until(check:()=>boolean) { const end=Date.now()+5000;while(!check()){if(Date.now()>end)throw new Error('Fixture deadline');await delay(10)} }

test('second server module uses unchanged lobby/auth/coordinator and completes without a score or winner', {timeout:10000}, async()=>{
  const registry=new Map([[definition.id,definition]])
  assert.equal(resolveGame('test-game',registry),definition)
  assert.throws(()=>resolveGame('unknown',registry))
  const coordinator=new GameSessionCoordinator()
  class TestRoom extends Room<{state:InstanceType<typeof State>;client:GameClient}> {
    state=new State();private transition='';private admission!:GameAdmission
    static async onAuth(){throw new ServerError(403,'PRIVATE_GAME')}
    async onCreate(options:{transitionId:string}){
      this.transition=options.transitionId
      assert.equal(coordinator.definition(this.transition)?.id,'test-game')
      this.maxClients=2;this.admission=new GameAdmission(coordinator,this.transition,this.roomId)
      await this.setMatchmaking({private:true,unlisted:true,locked:true})
    }
    onJoin(client:GameClient){const identity=this.admission.join(client);const p=new Player();p.userId=identity.userId;p.username=identity.username;p.avatarUrl='';this.state.players.set(client.sessionId,p)}
    activate(id:string){assert.ok(coordinator.canActivate(id,this.roomId));this.state.status='READY'}
    finishOnServer(){return coordinator.completed(this.transition,this.roomId,{gameId:'test-game',winnerUserId:null,reason:'completed',players:[...this.state.players.values()].map(p=>({userId:p.userId}))})}
    onLeave(client:GameClient){this.state.players.delete(client.sessionId);this.admission.leave(client)}
    onDispose(){this.admission.dispose();coordinator.disposed(this.transition,this.roomId)}
  }
  const server=new Server({transport:new WebSocketTransport(),greet:false,gracefullyShutdown:false})
  server.define('lobby',createLobbyRoom(async token=>{
    if(!token)throw new Error('Denied');return {userId:token,username:token,avatarUrl:null,expiresAt:Date.now()+60000}
  },coordinator,{registry,startDelayMs:10}))
  registerInternalGames(server,coordinator,[(s,c)=>s.define(definition.roomType,TestRoom).on('join',(room,client)=>{if(client.auth)c.admitted(client.auth,room.roomId,client.sessionId)})])
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
    const game=matchMaker.getLocalRoomById(reservation.roomId) as TestRoom
    assert.equal(game.finishOnServer(),true);assert.equal(game.finishOnServer(),false)
    await until(()=>a.state.status==='RESULTS'&&b.state.status==='RESULTS')
    assert.equal(a.state.winnerUserId,'');assert.equal(a.state.resultReason,'completed')
    a.state.resultPlayers?.forEach(player=>assert.equal(player.hasScore,false))
    a.send('return_to_lobby');await until(()=>a.state.status==='WAITING'&&!matchMaker.getLocalRoomById(reservation.roomId))
  } finally {await Promise.allSettled(connections.filter(c=>c.connection.isOpen).map(c=>c.leave()));await coordinator.shutdown();await server.gracefullyShutdown(false)}
})
