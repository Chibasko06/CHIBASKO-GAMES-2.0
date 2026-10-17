import { RuntimeError, type LaunchClient } from './contracts'

/** Auth header belongs to the portal HTTP adapter, never iframe/context. */
export function httpLaunchClient(getAccessToken?:()=>Promise<string|null>):LaunchClient {
  return {
    async create(request,signal) {
      const token=await getAccessToken?.()
      const response=await fetch('/api/game-launches',{method:'POST',signal,credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(request)})
      if(!response.ok)throw new RuntimeError('launch_unavailable')
      return (await response.json()).data
    },
    async release(handle) {
      await fetch('/api/game-launches/'+encodeURIComponent(handle.descriptor.launchId),{method:'DELETE',credentials:'omit',keepalive:true,cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({controlToken:handle.controlToken})})
    },
  }
}
