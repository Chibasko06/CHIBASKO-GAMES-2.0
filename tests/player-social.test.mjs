import test from 'node:test'
import assert from 'node:assert/strict'
import {createElement,act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import GameReactions from '../components/GameReactions.tsx'
import FavoriteButton from '../components/FavoriteButton.tsx'
import {supabase} from '@/lib/supabaseClient'

test('compact dock reactions and favorite reuse persisted platform actions and pressed states',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://portal.test'}),previous={window:globalThis.window,document:globalThis.document,CustomEvent:globalThis.CustomEvent,auth:globalThis.__productAuth,act:globalThis.IS_REACT_ACT_ENVIRONMENT}
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,CustomEvent:dom.window.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true})
 globalThis.__productAuth={user:{id:'player'},session:{user:{id:'player'}},loading:false}
 let reaction=null,favorite=false
 const writes=[],events=[]
 dom.window.addEventListener('favorites-updated',event=>events.push(event.detail))
 t.mock.method(supabase,'from',table=>{
  let deleting=false
  const chain={select(){return this},eq(){return this},delete(){deleting=true;return this},
   async maybeSingle(){return {data:table==='favorites'?(favorite?{id:'favorite'}:null):reaction?{reaction}:null,error:null}},
   async upsert(row){reaction=row.reaction;writes.push({table,row});return {error:null}},
   async insert(row){favorite=true;writes.push({table,row});return {error:null}},
   then(resolve){if(deleting){if(table==='favorites')favorite=false;else reaction=null;writes.push({table,delete:true})}return Promise.resolve({error:null}).then(resolve)}}
  return chain
 })
 t.mock.method(supabase,'rpc',async()=>({data:[{game_id:'game',likes_count:reaction==='like'?1:0,dislikes_count:reaction==='dislike'?1:0}]}))
 const root=createRoot(dom.window.document.getElementById('root'))
 try{
  await act(async()=>root.render(createElement('div',null,createElement(GameReactions,{gameId:'game',initialLikes:0,initialDislikes:0,compact:true}),createElement(FavoriteButton,{gameId:'game',compact:true}))))
  const button=label=>dom.window.document.querySelector(`[aria-label="${label}"]`)
  await act(async()=>button('J’aime').click());assert.equal(reaction,'like');assert.equal(button('J’aime').getAttribute('aria-pressed'),'true')
  await act(async()=>button('Je n’aime pas').click());assert.equal(reaction,'dislike');assert.equal(button('J’aime').getAttribute('aria-pressed'),'false')
  await act(async()=>button('Je n’aime pas').click());assert.equal(reaction,null)
  await act(async()=>button('Favori').click());assert.equal(favorite,true);assert.equal(button('Favori').getAttribute('aria-pressed'),'true')
  await act(async()=>button('Favori').click());assert.equal(favorite,false);assert.equal(events.length,2)
  assert.ok(writes.every(write=>['favorites','game_reactions'].includes(write.table)))
 }finally{
  await act(async()=>root.unmount());dom.window.close()
  Object.assign(globalThis,{window:previous.window,document:previous.document,CustomEvent:previous.CustomEvent,__productAuth:previous.auth,IS_REACT_ACT_ENVIRONMENT:previous.act})
 }
})
