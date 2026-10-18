import { RuntimeError, type LaunchClient } from './contracts'

/** Auth header belongs to the portal HTTP adapter, never iframe/context. */
export function httpLaunchClient(getAccessToken?:()=>Promise<string|null>):LaunchClient {
  return {
    async start(handle,signal){
      const response=await fetch('/api/game-launches/'+encodeURIComponent(handle.descriptor.launchId)+'/start',{method:'POST',signal,credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({controlToken:handle.controlToken,generation:handle.descriptor.generation})})
      if(!response.ok)throw new RuntimeError('online_session_unavailable')
      return (await response.json()).data
    },
    async create(request,signal) {
      const token=await getAccessToken?.()
      const response=await fetch('/api/game-launches',{method:'POST',signal,credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(request)})
      if(!response.ok)throw new RuntimeError('launch_unavailable')
      return (await response.json()).data
    },
    async release(handle) {
      await fetch('/api/game-launches/'+encodeURIComponent(handle.descriptor.launchId),{method:'DELETE',credentials:'omit',keepalive:true,cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({controlToken:handle.controlToken})})
    },
    async renew(handle,signal) {
      const response=await fetch('/api/game-launches/'+encodeURIComponent(handle.descriptor.launchId),{method:'PATCH',signal,credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({controlToken:handle.controlToken})})
      if(!response.ok)throw new RuntimeError(response.status>=400 && response.status<500?'launch_expired':'launch_renewal_unavailable')
      return (await response.json()).data
    },
  }
}
