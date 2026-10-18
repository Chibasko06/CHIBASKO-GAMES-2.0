import { LobbyError, LOBBY_UI_POLICY } from './contracts'
/** Auth is portal-only. No token is passed to a game iframe or its launch context. */
export function lobbyClient(getToken:()=>Promise<string|null>,fetcher:typeof fetch=fetch) {
 return async function request<T>(path:string,body?:Record<string,unknown>,signal?:AbortSignal):Promise<T> {
  const token=await getToken()
  if(!token)throw new LobbyError('unauthorized',401)
  const response=await fetcher('/api/multiplayer/'+path,{method:body?'POST':'GET',credentials:'omit',cache:'no-store',
   headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,
   signal:signal?AbortSignal.any([signal,AbortSignal.timeout(LOBBY_UI_POLICY.requestMs)]):AbortSignal.timeout(LOBBY_UI_POLICY.requestMs)})
  const result=await response.json()
  if(!response.ok)throw new LobbyError(result.error?.code??'service_unavailable',response.status)
  return result.data as T
 }
}
