import {test,beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {createElement,act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import {AuthProvider,useAuth} from '../components/AuthProvider.tsx'
import AdminPage from '../app/admin/page.tsx'
import {ADMIN_CHECK_TIMEOUT_MS} from '../components/admin/useAdminAccess.ts'

let subscribers,statusCalls,mode,signals
const session=(id='admin',token='token-a')=>({user:{id},access_token:token})
beforeEach(t=>{
  subscribers=new Set();statusCalls=0;mode='allowed';signals=[]
  globalThis.__productSession=session();delete globalThis.__productNavigation
  delete globalThis.__productGetSession;delete globalThis.__productRestore
  globalThis.__productSubscribe=cb=>{
    subscribers.add(cb)
    return{data:{subscription:{unsubscribe(){subscribers.delete(cb)}}}}
  }
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    signals.push(init.signal)
    if(input==='/api/admin/status'){
      statusCalls++
      if(mode==='pending')return new Promise(()=>{})
      if(mode==='offline')throw Error('Network failure')
      return Response.json({isAdmin:mode==='allowed'},{status:mode==='denied'?403:mode==='expired'?401:200})
    }
    return Response.json({games:[],users:[],categories:[],faq:[],submissions:[]})
  })
})
const emit=async(event,next)=>{
  globalThis.__productSession=next
  await act(async()=>{for(const cb of subscribers)cb(event,next)})
}
const visible=async(state)=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,value:state})
  await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')))
}
const panel=()=>document.querySelector('input[aria-label="Titre"]')
async function mounted(run,Component=AdminPage){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:3000/admin'})
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'})
  const root=createRoot(document.getElementById('root'))
  try{
    await act(async()=>root.render(createElement(AuthProvider,null,createElement(Component))))
    await run(root)
  }finally{
    await act(async()=>root.unmount());dom.window.close()
    delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
}

test('same-token SIGNED_IN and tab restoration preserve admin; only the server confirms membership',async()=>{
  await mounted(async()=>{
    assert.ok(panel());assert.equal(subscribers.size,1)
    const calls=statusCalls
    await emit('SIGNED_IN',session())
    assert.ok(panel());assert.equal(statusCalls,calls)
    await visible('hidden');assert.ok(panel());assert.equal(statusCalls,calls)
    await visible('visible');assert.ok(panel());assert.equal(statusCalls,calls+1)
    await emit('TOKEN_REFRESHED',session('admin','token-b'))
    assert.ok(panel());assert.equal(statusCalls,calls+2)
    assert.equal(subscribers.size,1)
  })
  assert.equal(subscribers.size,0)
})

test('status failure ends checking and offers retry without exposing the admin panel',async()=>{
  await mounted(async()=>{
    mode='offline';await visible('visible')
    assert.equal(panel(),null);assert.match(document.body.textContent,/Impossible de vérifier/)
    assert.doesNotMatch(document.body.textContent,/Vérification de l’accès administrateur…/)
    mode='allowed';await act(async()=>document.querySelector('button').click());assert.ok(panel())
  })
})

test('a hung status or session refresh times out; late work cannot restore access',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  await mounted(async()=>{
    mode='pending';await visible('visible')
    await act(async()=>t.mock.timers.tick(ADMIN_CHECK_TIMEOUT_MS))
    assert.equal(panel(),null);assert.match(document.body.textContent,/Impossible de vérifier/)
    assert.ok(signals.at(-1).aborted)
    let finish
    const calls=statusCalls
    globalThis.__productGetSession=()=>new Promise(resolve=>{finish=resolve})
    mode='allowed';await act(async()=>document.querySelector('button').click())
    await act(async()=>t.mock.timers.tick(ADMIN_CHECK_TIMEOUT_MS))
    assert.equal(panel(),null)
    await act(async()=>finish({data:{session:session()}}))
    assert.equal(statusCalls,calls);assert.equal(panel(),null)
  })
})

test('removed session and an expired server session lead to safe login',async()=>{
  await mounted(async()=>{
    mode='expired';await visible('visible')
    assert.equal(panel(),null);assert.equal(globalThis.__productNavigation,'/login?next=%2Fadmin')
    mode='allowed';await emit('TOKEN_REFRESHED',session('admin','token-b'));assert.ok(panel())
    await emit('SIGNED_OUT',null)
    assert.equal(panel(),null);assert.match(document.body.textContent,/Connexion requise/)
    assert.equal(globalThis.__productNavigation,'/login?next=%2Fadmin')
  })
})

test('revoked membership denies access on return even with a previously successful check',async()=>{
  await mounted(async()=>{
    assert.ok(panel());mode='denied';await visible('visible')
    assert.equal(panel(),null);assert.match(document.body.textContent,/Accès administrateur refusé/)
  })
})

test('cleanup removes the one visibility/auth listener and aborts pending work',async t=>{
  await mounted(async root=>{
    const listeners=new Set()
    const add=document.addEventListener.bind(document),remove=document.removeEventListener.bind(document)
    t.mock.method(document,'addEventListener',(type,cb,...args)=>{if(type==='visibilitychange')listeners.add(cb);return add(type,cb,...args)})
    t.mock.method(document,'removeEventListener',(type,cb,...args)=>{if(type==='visibilitychange')listeners.delete(cb);return remove(type,cb,...args)})
    await emit('TOKEN_REFRESHED',session('admin','token-b'));assert.equal(listeners.size,1)
    await emit('TOKEN_REFRESHED',session('admin','token-c'));assert.equal(listeners.size,1)
    mode='pending';await visible('visible');const signal=signals.at(-1),calls=statusCalls
    await act(async()=>root.unmount())
    assert.ok(signal.aborted);assert.equal(listeners.size,0);assert.equal(subscribers.size,0)
    await visible('visible');assert.equal(statusCalls,calls)
  })
})

test('account switch aborts the old check; old responses cannot authorize the new user',async()=>{
  let complete
  await mounted(async()=>{
    assert.ok(panel())
    globalThis.__productGetSession=()=>new Promise(resolve=>{complete=resolve})
    await visible('visible')
    globalThis.__productGetSession=undefined
    mode='denied'
    await emit('SIGNED_IN',session('other','token-other'))
    assert.equal(panel(),null)
    await act(async()=>complete({data:{session:session()}}))
    assert.equal(panel(),null);assert.match(document.body.textContent,/Accès administrateur refusé/)
  })
})

test('AuthProvider ignores stale bootstrap after signOut and cleans its subscription',async()=>{
  let complete
  globalThis.__productRestore=()=>new Promise(resolve=>{complete=resolve})
  function Probe(){const{user,loading}=useAuth();return createElement('p',null,loading?'loading':user?.id??'signed-out')}
  await mounted(async()=>{
    await emit('SIGNED_OUT',null);assert.equal(document.body.textContent,'signed-out')
    await act(async()=>complete(session()))
    assert.equal(document.body.textContent,'signed-out')
  },Probe)
  assert.equal(subscribers.size,0)
})
