import { connectGameRoom } from './gameConnection'
export function connectPlayground<State>(token: string, endpoint = 'http://127.0.0.1:2567') {
  return connectGameRoom<State>(token, 'joinOrCreate', 'playground', endpoint)
}
