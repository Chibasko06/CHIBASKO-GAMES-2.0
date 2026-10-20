import { uploadRepository } from '../lib/game-distribution/uploads/repository'
import { dispatchUploads } from '../services/build-validator/queue'

type Environment={SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string;BUILD_VALIDATIONS:{send(body:string,options:{contentType:'text'}):Promise<unknown>}}
/** Separate scheduled Worker, never executes ZIP/game content. No public HTTP API. */
const dispatcher = {
  async scheduled(_event: unknown,env: Environment) {
    const started=Date.now()
    try {
      const result=await dispatchUploads(uploadRepository(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY),
        uploadId=>env.BUILD_VALIDATIONS.send(JSON.stringify({type:'validate_game_build',uploadId}),{contentType:'text'}))
      console.log(JSON.stringify({event:'build_dispatch_cycle',...result,durationMs:Date.now()-started}))
      if(result.failed)throw new Error('dispatch_cycle_failed')
    }catch {
      console.error(JSON.stringify({event:'build_dispatch_failed',durationMs:Date.now()-started}))
      throw new Error('dispatch_cycle_failed')
    }
  },
  fetch(){return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}})},
}
export default dispatcher
