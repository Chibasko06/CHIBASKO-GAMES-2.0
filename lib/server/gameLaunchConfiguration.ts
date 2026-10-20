import {GatewayError} from '../game-distribution/gateway/contracts'
import {validateLaunchConfiguration} from '../game-distribution/gateway/launch'
const required=['GAME_RUNTIME_LAUNCHES_ENABLED','GAME_CONTENT_BASE_DOMAIN','GAME_PORTAL_ORIGINS','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']
export type LaunchEnvironmentReport={present:string[];missing:string[];invalid:string[]}
export class LaunchConfigurationError extends GatewayError{
 constructor(readonly configuration:LaunchEnvironmentReport,readonly reason:'launches_disabled'|'missing_environment'|'invalid_environment'|'invalid_content_origin'){
  super(reason==='invalid_content_origin'?'invalid_gateway_configuration':'service_unavailable',503)
 }
}
export function requireLaunchAuthenticationConfiguration(env:Record<string,string|undefined>){
 const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY']
 const missing=names.filter(name=>!env[name])
 if(missing.length)throw new LaunchConfigurationError({present:names.filter(name=>!!env[name]),missing,invalid:[]},'missing_environment')
}
export function launchConfiguration(env:Record<string,string|undefined>){
 const report:LaunchEnvironmentReport={present:required.filter(name=>!!env[name]),missing:required.filter(name=>!env[name]),invalid:required.filter(name=>!!env[name]&&(env[name]!.trim()!==env[name]||/[\r\n\u0000]/.test(env[name]!)))}
 if(env.GAME_RUNTIME_LAUNCHES_ENABLED!=='1')throw new LaunchConfigurationError(report,'launches_disabled')
 if(report.missing.length)throw new LaunchConfigurationError(report,'missing_environment')
 try{const url=new URL(env.NEXT_PUBLIC_SUPABASE_URL!);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error()}catch{report.invalid.push('NEXT_PUBLIC_SUPABASE_URL')}
 if(env.SUPABASE_SERVICE_ROLE_KEY?.startsWith('sb_publishable_'))report.invalid.push('SUPABASE_SERVICE_ROLE_KEY')
 if(report.invalid.length)throw new LaunchConfigurationError(report,'invalid_environment')
 const config={publicBase:env.GAME_CONTENT_PUBLIC_BASE??'',previewBase:env.GAME_CONTENT_PREVIEW_BASE??'',contentBase:env.GAME_CONTENT_BASE_DOMAIN!,portalOrigins:env.GAME_PORTAL_ORIGINS!.split(',').map(s=>s.trim()).filter(Boolean)}
 try{return validateLaunchConfiguration(config)}catch{
  throw new LaunchConfigurationError({...report,invalid:['GAME_CONTENT_BASE_DOMAIN','GAME_PORTAL_ORIGINS']},'invalid_content_origin')
 }
}
