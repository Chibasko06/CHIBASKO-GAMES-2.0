import {readFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {join} from 'node:path'

export const REVIEW_ENV_FILE='.env.review.local'
export const REVIEW_REQUIRED_NAMES=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','GAME_BUILDS_R2_ACCOUNT_ID','GAME_BUILDS_R2_ACCESS_KEY_ID','GAME_BUILDS_R2_SECRET_ACCESS_KEY','GAME_BUILDS_STAGING_BUCKET','GAME_BUILDS_ARTIFACTS_BUCKET']
export class ReviewConfigurationError extends Error{
 constructor(code,names=[]){super(code);this.code=code;this.names=names}
}
/** Only the dedicated local file is loaded; injected environment variables take precedence. */
export async function loadReviewEnvironment(directory,env=process.env){
 let content
 try{content=await readFile(join(directory,REVIEW_ENV_FILE),'utf8')}catch(error){if(error.code==='ENOENT')return false;throw new ReviewConfigurationError('review_env_file_unreadable')}
 let values
 try{values=parseEnv(content)}catch{throw new ReviewConfigurationError('review_env_file_invalid')}
 for(const [name,value] of Object.entries(values))if(env[name]===undefined)env[name]=value
 return true
}
export function reviewEnvironmentReport(env){
 const url=env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL
 const normalized={...env,SUPABASE_URL:url}
 const missing=REVIEW_REQUIRED_NAMES.filter(name=>!normalized[name]),present=REVIEW_REQUIRED_NAMES.filter(name=>!!normalized[name])
 const invalid=present.filter(name=>normalized[name].trim()!==normalized[name]||/[\r\n\u0000]/.test(normalized[name]))
 if(url){try{const parsed=new URL(url);if(!(['https:'].includes(parsed.protocol)||parsed.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw Error()}catch{invalid.push('SUPABASE_URL')}}
 if(env.GAME_BUILDS_R2_ACCOUNT_ID&&!/^[a-f0-9]{32}$/.test(env.GAME_BUILDS_R2_ACCOUNT_ID))invalid.push('GAME_BUILDS_R2_ACCOUNT_ID')
 for(const name of ['GAME_BUILDS_STAGING_BUCKET','GAME_BUILDS_ARTIFACTS_BUCKET'])if(env[name]&&!/^[a-z0-9][a-z0-9-]{1,62}$/.test(env[name]))invalid.push(name)
 if(env.SUPABASE_SERVICE_ROLE_KEY?.startsWith('sb_publishable_'))invalid.push('SUPABASE_SERVICE_ROLE_KEY')
 if(env.GAME_BUILDS_STAGING_BUCKET&&env.GAME_BUILDS_STAGING_BUCKET===env.GAME_BUILDS_ARTIFACTS_BUCKET)invalid.push('GAME_BUILDS_STAGING_BUCKET','GAME_BUILDS_ARTIFACTS_BUCKET')
 return {present,missing,invalid:[...new Set(invalid)]}
}
export function configureReviewEnvironment(env=process.env){
 const report=reviewEnvironmentReport(env)
 if(report.missing.length)throw new ReviewConfigurationError('review_missing_environment',report.missing)
 if(report.invalid.length)throw new ReviewConfigurationError('review_invalid_environment',report.invalid)
 env.SUPABASE_URL ||=env.NEXT_PUBLIC_SUPABASE_URL
 return report
}
export function configurationFailure(error){
 if(error instanceof ReviewConfigurationError)return error.code+(error.names.length?': '+error.names.join(', '):'')+' — configuration locale dans '+REVIEW_ENV_FILE
 return 'review_configuration_failed — vérifier la configuration locale dans '+REVIEW_ENV_FILE
}
