import {test,beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {createElement,act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import Register from '../app/register/page.tsx'
import Reactions from '../components/GameReactions.tsx'
import Login from '../app/login/page.tsx'
import Callback from '../app/auth/callback/page.tsx'
import Dashboard from '../app/dashboard/page.tsx'
import Favorites from '../app/favorites/page.tsx'
import Reviews from '../components/GameReviews.tsx'
import {AUTH_OPERATION_TIMEOUT_MS,withTimeout} from '../lib/asyncOperation.ts'

let callbacks,mode,session
beforeEach(t=>{
  callbacks=new Set();mode='ok';session={access_token:'fixture-token',user:{id:'A'}}
  const chain={select(){return chain},eq(){return chain},order(){return chain},limit(){return chain},range(){return chain},
    single:async()=>({data:{id:'A',username:'Player',bio:''},error:null}),
    then(resolve){return Promise.resolve({data:[],count:0,error:null}).then(resolve)}}
  globalThis.__reliability={auth:{loading:false,user:null,session:null},router:{replace(path){globalThis.__destination=path}},
    db:{from(){return chain},rpc:async(name)=>({data:name==='public_profiles_page'?{items:[],total:0}:[],error:null}),auth:{getSession:async()=>({data:{session:null},error:null}),
      onAuthStateChange(cb){callbacks.add(cb);return{data:{subscription:{unsubscribe(){callbacks.delete(cb)}}}}},
      signInWithPassword:async()=>{throw new TypeError('private network URL')}}}}
  delete globalThis.__destination
  t.mock.method(globalThis,'fetch',async()=>{
    if(mode==='offline')throw new TypeError('private transport')
    return Response.json({profile:{id:'A',username:'Player',bio:''}})
  })
})
async function mount(Component,run){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://site.example/auth/callback?next=%2Fdashboard'})
  dom.window.HTMLElement.prototype.attachEvent=()=>{};dom.window.HTMLElement.prototype.detachEvent=()=>{}
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
  const root=createRoot(document.getElementById('root'))
  try{await act(async()=>root.render(createElement(Component)));await run(root)}
  finally{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT}
}
const button=text=>Array.from(document.querySelectorAll('button')).find(node=>node.textContent===text)

test('login network rejection releases the button and exposes a safe retry message',async()=>{
  await mount(Login,async()=>{
    await act(async()=>button('Connexion').click())
    assert.equal(button('Connexion').disabled,false)
    assert.match(document.body.textContent,/interrompue/)
    assert.doesNotMatch(document.body.textContent,/private network/)
  })
})
test('callback without a session ends waiting and supports retry without stale navigation',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  await mount(Callback,async()=>{
    assert.equal(callbacks.size,1)
    await act(async()=>t.mock.timers.tick(AUTH_OPERATION_TIMEOUT_MS))
    assert.match(document.body.textContent,/pas pu être finalisée/)
    assert.ok(button('Réessayer'))
    await act(async()=>{for(const cb of callbacks)cb('SIGNED_IN',session)})
    assert.equal(globalThis.__destination,undefined)
    await act(async()=>button('Réessayer').click())
    await act(async()=>{for(const cb of callbacks)cb('SIGNED_IN',session)})
    assert.equal(globalThis.__destination,'/dashboard')
  })
  assert.equal(callbacks.size,0)
})
test('callback network rejection offers an exit rather than permanent finalization',async()=>{
  globalThis.__reliability.db.auth.getSession=async()=>{throw Error('private auth')}
  await mount(Callback,async()=>{assert.ok(button('Réessayer'));assert.ok(document.querySelector('a[href="/login"]'));assert.doesNotMatch(document.body.textContent,/private auth/)})
})
test('profile save network failure releases saving state without replacing the saved profile',async()=>{
  globalThis.__reliability.auth={loading:false,user:session.user,session}
  await mount(Dashboard,async()=>{
    const edit=Array.from(document.querySelectorAll('button')).find(node=>/Modifier le profil/.test(node.textContent))
    assert.ok(edit);await act(async()=>edit.click());mode='offline'
    const save=Array.from(document.querySelectorAll('button')).find(node=>/Sauvegarder/.test(node.textContent))
    assert.ok(save);await act(async()=>save.click())
    assert.equal(save.disabled,false);assert.match(document.body.textContent,/sauvegarde n’a pas pu être confirmée/)
  })
})
test('network deadlines reject the waiting caller even if the underlying promise resolves later',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  let resolve;const operation=withTimeout(new Promise(done=>{resolve=done}))
  const failure=assert.rejects(operation,{name:'OperationTimeoutError'})
  t.mock.timers.tick(AUTH_OPERATION_TIMEOUT_MS);await failure;resolve('late success')
})

test('favorite read failure renders an unavailable state rather than an empty collection',async()=>{
  globalThis.__reliability.auth={loading:false,user:session.user,session}
  globalThis.__reliability.db.from=()=>{
    const chain={select(){return chain},eq(){return chain},order(){return chain},
      then(resolve){return Promise.resolve({data:null,error:{code:'08006',message:'private database'}}).then(resolve)}}
    return chain
  }
  await mount(Favorites,async()=>{
    assert.match(document.querySelector('[role="alert"]').textContent,/Impossible de charger les favoris/)
    assert.doesNotMatch(document.body.textContent,/Aucun favori|private database/)
  })
})

test('review read failure renders an unavailable state rather than no comments or zero ratings',async()=>{
  globalThis.__reliability.db.rpc=async()=>({data:null,error:{code:'08006',message:'private database'}})
  await mount(()=>createElement(Reviews,{gameId:'fixture'}),async()=>{
    assert.match(document.body.textContent,/Avis temporairement indisponibles/)
    assert.doesNotMatch(document.body.textContent,/Aucun commentaire|0 avis publics|private database/)
  })
})

const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no}); return {promise,resolve,reject} }
function socialFixture() {
  const store={reaction:null,likes:4,dislikes:2,reviews:[],writes:[],held:null,writeError:false,statsError:false,personalReads:[],statsReads:[],reviewReads:[]}
  const apply = (kind,payload) => {
    if(kind==='reaction') {
      if(store.reaction==='like')store.likes--;if(store.reaction==='dislike')store.dislikes--;
      store.reaction=payload;if(payload==='like')store.likes++;if(payload==='dislike')store.dislikes++;
    } else store.reviews=kind==='review-delete'?[]:[reviewRow(payload.comment)]
  }
  const write=(kind,payload)=>{
    store.writes.push({kind,payload})
    if(store.held){const held=store.held;store.held=null;held.commit=()=>{apply(kind,payload);held.resolve({error:null})};return held.promise}
    if(store.writeError)return Promise.resolve({error:{code:'08006',message:'private SQL credential'}})
    apply(kind,payload);return Promise.resolve({error:null})
  }
  globalThis.__reliability.auth={loading:false,user:session.user,session}
  globalThis.__reliability.db.from=table=>{
    const chain={select(){return chain},eq(){return chain},delete(){chain.deleting=true;return chain},
      maybeSingle:()=>store.personalReads.length?store.personalReads.shift().promise:Promise.resolve({data:store.reaction?{reaction:store.reaction}:null,error:null}),
      upsert:payload=>write(table==='game_reactions'?'reaction':'review',table==='game_reactions'?payload.reaction:payload),
      then:(yes,no)=>write(table==='game_reactions'?'reaction':'review-delete',null).then(yes,no)}
    return chain
  }
  globalThis.__reliability.db.rpc=name=>{const operation=(async()=>{
    if(name==='get_game_reviews')return store.reviewReads.length?store.reviewReads.shift().promise:{data:store.reviews,error:null}
    if(store.statsReads.length)return store.statsReads.shift().promise
    return store.statsError?{data:null,error:{code:'08006',message:'private stats'}}:{data:[{game_id:'G',likes_count:store.likes,dislikes_count:store.dislikes}],error:null}
  })();return {order(){return this},range(from,to){return operation.then(result=>({...result,count:result.data?.length??0,data:result.data?.slice(from,to+1)??null}))},then(resolve,reject){return operation.then(resolve,reject)}}}
  return store
}
const reviewRow = comment => ({id:'R',user_id:'A',username:'Player',avatar_url:null,rating:5,comment,created_at:'2026-10-24',updated_at:'2026-10-24'})
const likeButton=()=>document.querySelector('button[aria-label="J’aime"]')
const reactionView=()=>createElement(Reactions,{gameId:'G',initialLikes:4,initialDislikes:2,compact:true})

test('unresolved reaction write releases controls but recovery never repeats it',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const store=socialFixture();store.held=deferred()
  await mount(reactionView,async()=>{
    await act(async()=>likeButton().click());assert.equal(likeButton().disabled,true)
    await act(async()=>t.mock.timers.tick(AUTH_OPERATION_TIMEOUT_MS))
    assert.equal(likeButton().disabled,false);assert.match(document.body.textContent,/attente de confirmation/)
    await act(async()=>likeButton().click());assert.equal(store.writes.length,1)
    assert.match(document.body.textContent,/attente de confirmation/)
  })
})
test('late committed reaction is read back before any further mutation',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const store=socialFixture(),held=deferred();store.held=held
  await mount(reactionView,async()=>{
    await act(async()=>likeButton().click());await act(async()=>t.mock.timers.tick(AUTH_OPERATION_TIMEOUT_MS))
    await act(async()=>held.commit());assert.equal(likeButton().getAttribute('aria-pressed'),'false')
    await act(async()=>likeButton().click());assert.equal(store.writes.length,1)
    assert.equal(likeButton().getAttribute('aria-pressed'),'true');assert.equal(likeButton().title,'J’aime · 5')
    await act(async()=>likeButton().click());assert.equal(store.writes.length,2);assert.equal(store.reaction,null)
  })
})
test('confirmed reaction survives failed counters and recovery reloads both values',async()=>{
  const store=socialFixture()
  await mount(reactionView,async()=>{
    store.statsError=true;await act(async()=>likeButton().click())
    assert.equal(store.reaction,'like');assert.equal(likeButton().getAttribute('aria-pressed'),'true')
    assert.match(likeButton().title,/Compteurs indisponibles/)
    store.statsError=false;store.reaction='dislike';store.likes=8;store.dislikes=9
    await act(async()=>likeButton().click());assert.equal(store.writes.length,1)
    assert.equal(likeButton().getAttribute('aria-pressed'),'false');assert.equal(likeButton().title,'J’aime · 8')
    assert.equal(document.querySelector('button[aria-label="Je n’aime pas"]').getAttribute('aria-pressed'),'true')
  })
})
 for(const compact of [true,false])test('reaction upsert and delete errors remain safe and visible, compact='+compact,async()=>{
  const store=socialFixture()
  await mount(()=>createElement(Reactions,{gameId:'G',initialLikes:4,initialDislikes:2,compact}),async()=>{
    store.writeError=true;await act(async()=>likeButton().click())
    assert.match(document.querySelector('[role="status"]').textContent,/n’a pas pu être confirmée/)
    assert.doesNotMatch(document.body.textContent,/private|SQL|credential/)
    store.writeError=false;await act(async()=>likeButton().click());assert.equal(store.reaction,'like')
    store.writeError=true;await act(async()=>likeButton().click());assert.equal(store.reaction,'like')
    assert.match(document.querySelector('[role="status"]').textContent,/n’a pas pu être confirmée/)
  })
})
test('unresolved review deletion releases controls and does not delete twice',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const store=socialFixture(),held=deferred();store.reviews=[reviewRow('Existing')];store.held=held
  await mount(()=>createElement(Reviews,{gameId:'G'}),async()=>{
    window.confirm=()=>true
    await act(async()=>document.querySelector('button[title="Supprimer mon commentaire"]').click())
    await act(async()=>t.mock.timers.tick(AUTH_OPERATION_TIMEOUT_MS))
    assert.equal(button('Vérifier les avis').disabled,false)
    await act(async()=>button('Vérifier les avis').click());assert.equal(store.writes.length,1)
    await act(async()=>held.commit());await act(async()=>button('Vérifier les avis').click())
    assert.equal(store.writes.length,1);assert.doesNotMatch(document.body.textContent,/Existing/)
    assert.ok(button('Publier mon avis'))
  })
})
test('late review reads cannot replace a newer focus refresh',async()=>{
  const store=socialFixture(),old=deferred(),latest=deferred();store.reviewReads.push(old,latest)
  await mount(()=>createElement(Reviews,{gameId:'G'}),async()=>{
    await act(async()=>window.dispatchEvent(new window.Event('focus')))
    await act(async()=>latest.resolve({data:[reviewRow('Latest review')],error:null}))
    await act(async()=>old.resolve({data:[reviewRow('Obsolete review')],error:null}))
    assert.match(document.body.textContent,/Latest review/);assert.doesNotMatch(document.body.textContent,/Obsolete review/)
  })
})
test('a late read for another game cannot replace current reactions or counters',async()=>{
  const store=socialFixture(),old=deferred();store.statsReads.push(old)
  await mount(reactionView,async root=>{
    await act(async()=>root.render(createElement(Reactions,{gameId:'H',initialLikes:0,initialDislikes:0,compact:true})))
    await act(async()=>old.resolve({data:[{game_id:'G',likes_count:999,dislikes_count:999}],error:null}))
    assert.equal(likeButton().title,'J’aime · 0')
  })
})
 for(const Component of [Login,Register])test('profile synchronization after unmount cannot navigate: '+Component.name,async t=>{
  const profile=deferred();globalThis.__reliability.db.auth.signInWithPassword=async()=>({data:{session},error:null})
  globalThis.__reliability.db.auth.signUp=async()=>({data:{session},error:null})
  t.mock.method(globalThis,'fetch',()=>profile.promise)
  await mount(Component,async root=>{
    await act(async()=>Component===Login?button('Connexion').click():document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
    await act(async()=>root.unmount());await act(async()=>profile.resolve(Response.json({profile:{id:'A'}})))
    assert.equal(globalThis.__destination,undefined)
  })
})

test('a recovery read started before commit cannot authorize another write',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const store=socialFixture(),held=deferred(),read=deferred();store.held=held
  await mount(reactionView,async()=>{
    await act(async()=>likeButton().click());store.personalReads.push(read)
    await act(async()=>t.mock.timers.tick(AUTH_OPERATION_TIMEOUT_MS))
    await act(async()=>held.commit());await act(async()=>read.resolve({data:null,error:null}))
    assert.match(document.body.textContent,/attente de confirmation/)
    await act(async()=>likeButton().click());assert.equal(store.writes.length,1)
    assert.equal(likeButton().getAttribute('aria-pressed'),'true');assert.equal(likeButton().title,'J’aime · 5')
  })
})
test('reaction deletion has the same deadline and read-before-write recovery',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const store=socialFixture(),held=deferred();store.reaction='like';store.held=held
  await mount(reactionView,async()=>{
    await act(async()=>likeButton().click());await act(async()=>t.mock.timers.tick(AUTH_OPERATION_TIMEOUT_MS))
    assert.equal(likeButton().disabled,false);await act(async()=>likeButton().click());assert.equal(store.writes.length,1)
    await act(async()=>held.commit());await act(async()=>likeButton().click())
    assert.equal(store.writes.length,1);assert.equal(likeButton().getAttribute('aria-pressed'),'false')
  })
})
 for(const Component of [Login,Register])test('active authentication still navigates only after profile synchronization: '+Component.name,async t=>{
  const profile=deferred();globalThis.__reliability.db.auth.signInWithPassword=async()=>({data:{session},error:null})
  globalThis.__reliability.db.auth.signUp=async()=>({data:{session},error:null})
  t.mock.method(globalThis,'fetch',()=>profile.promise)
  await mount(Component,async()=>{
    await act(async()=>Component===Login?button('Connexion').click():document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
    assert.equal(globalThis.__destination,undefined)
    await act(async()=>profile.resolve(Response.json({profile:{id:'A'}})));assert.equal(globalThis.__destination,'/dashboard')
  })
})
test('review publication waits for uncertain writes and reconciles a late commit',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const store=socialFixture(),held=deferred();store.held=held
  await mount(()=>createElement(Reviews,{gameId:'G'}),async()=>{
    const input=document.querySelector('textarea');input.attachEvent=()=>{};input.detachEvent=()=>{}
    await act(async()=>{input.focus();Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(input,'New review');input.dispatchEvent(new window.KeyboardEvent('keyup',{bubbles:true,key:'w'}))})
    await act(async()=>button('Publier mon avis').click());assert.equal(store.writes.length,1)
    await act(async()=>t.mock.timers.tick(AUTH_OPERATION_TIMEOUT_MS));assert.equal(button('Vérifier les avis').disabled,false)
    await act(async()=>button('Vérifier les avis').click());assert.equal(store.writes.length,1)
    await act(async()=>held.commit());await act(async()=>button('Vérifier les avis').click())
    assert.equal(store.writes.length,1);assert.match(document.body.textContent,/New review/);assert.ok(button('Publier mon avis'))
  })
})
