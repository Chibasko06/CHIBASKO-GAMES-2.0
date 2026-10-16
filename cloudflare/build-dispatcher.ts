import { uploadRepository } from '../lib/game-distribution/uploads/repository'
import { dispatchUploads } from '../services/build-validator/queue'

type Environment={SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string;BUILD_VALIDATIONS:{send(body:string,options:{contentType:'text'}):Promise<void>}}
/** Separate scheduled Worker, never executes ZIP/game content. No public HTTP API. */
const dispatcher = {
  async scheduled(_event: unknown,env: Environment) {
    await dispatchUploads(uploadRepository(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY),
      uploadId=>env.BUILD_VALIDATIONS.send(JSON.stringify({type:'validate_game_build',uploadId}),{contentType:'text'}))
  },
}
export default dispatcher
