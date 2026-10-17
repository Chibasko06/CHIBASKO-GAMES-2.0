import { validateManifest } from '../manifest'
import { gameArtifactKeys } from '../keys'
import { UUID } from '../uploads/policy'
import { getDomain, parse } from 'tldts'
import type { UploadRepository } from '../uploads/contracts'
import { GatewayError, type ResolvedGameVersion, type DeliveryPolicy, type GatewayConfiguration, type GameLaunchDescriptor, type Execution } from './contracts'

export function validateDeliveryPolicy(value: unknown): DeliveryPolicy {
  const p=value as DeliveryPolicy
  if(!p || !['web-v1','web-isolated-v1','web-legacy-v1'].includes(p.profile)
    || Object.keys(p).some(k=>!['profile','connectOrigins','assetOrigins'].includes(k)))throw new GatewayError('invalid_delivery_policy',503)
  for(const [type,list] of [['connect',p.connectOrigins],['assets',p.assetOrigins]] as const) {
    if(!Array.isArray(list) || list.length>32)throw new GatewayError('invalid_delivery_policy',503)
    for(const origin of list) {
      let url:URL
      try{url=new URL(origin)}catch{throw new GatewayError('invalid_delivery_policy',503)}
      if(url.origin!==origin || url.username || url.password || !['https:',...(type==='connect'?['wss:']:[])].includes(url.protocol)
        || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname)
        || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname))throw new GatewayError('invalid_delivery_policy',503)
    }
  }
  return Object.freeze({profile:p.profile,connectOrigins:Object.freeze([...p.connectOrigins]),assetOrigins:Object.freeze([...p.assetOrigins])})
}
export async function resolveGameVersion(versionId:string,db:UploadRepository):Promise<ResolvedGameVersion> {
  if(!UUID.test(versionId))throw new GatewayError('version_not_found',404)
  const row=await db.call<Record<string,unknown>|null>('distribution_resolve_version',{p_version:versionId})
  if(!row)throw new GatewayError('version_not_found',404)
  try {
    if(row.id!==versionId || typeof row.game_id!=='string' || typeof row.version!=='string'
      || typeof row.artifact_sha256!=='string' || !['draft','in_review','approved','published','rejected','archived'].includes(String(row.status)))throw new Error()
    const manifest=validateManifest(row.manifest,{gameId:row.game_id,version:row.version})
    const prefix=gameArtifactKeys(row.game_id,versionId,row.artifact_sha256).clientPrefix
    if(prefix!==row.storage_prefix || row.schema_version!==manifest.schemaVersion || row.integration_version!==manifest.integrationVersion)throw new Error()
    const policy=validateDeliveryPolicy(row.delivery_policy)
    if(manifest.client.requirements?.crossOriginIsolation && policy.profile!=='web-isolated-v1')throw new GatewayError('unsupported_delivery_policy',503)
    return Object.freeze({gameId:row.game_id,versionId,manifest,storagePrefix:prefix,contentHash:row.artifact_sha256,
      status:row.status as ResolvedGameVersion['status'],entrypoints:manifest.client.entrypoints,policy})
  }catch(error){if(error instanceof GatewayError)throw error;throw new GatewayError('invalid_version_record',503)}
}
export function contentOrigin(config:GatewayConfiguration,kind:'public'|'preview',id:string) {
  if(!UUID.test(id))throw new GatewayError('invalid_launch',400)
  return `https://${kind==='public'?'v':'p'}-${id.replaceAll('-','')}.${kind==='public'?config.publicBase:config.previewBase}`
}
export function launchDescriptor(version:ResolvedGameVersion,execution:Execution,origin:string):GameLaunchDescriptor {
  const path=version.entrypoints[execution]
  if(!path || !version.manifest.capabilities[execution])throw new GatewayError('unsupported_execution',400)
  return Object.freeze({gameId:version.gameId,gameVersionId:version.versionId,integrationVersion:version.manifest.integrationVersion,
    execution,entrypointUrl:new URL(path,origin+'/').href,capabilities:version.manifest.capabilities,contentOrigin:origin})
}
export function validateGatewayConfiguration(config:GatewayConfiguration) {
  if(!config.portalOrigins.length)throw new GatewayError('invalid_gateway_configuration',503)
  for(const base of [config.publicBase,config.previewBase]) {
    if(base.length>218 || base.split('.').some(label=>label.length>63) || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(base))throw new GatewayError('invalid_gateway_configuration',503)
    for(const portal of config.portalOrigins) {
      const url=new URL(portal)
      const contentSite=getDomain(base,{allowPrivateDomains:true}),portalSite=getDomain(url.hostname,{allowPrivateDomains:true}),suffix=parse(base,{allowPrivateDomains:true})
      const privateBase=suffix.isPrivate && suffix.publicSuffix===base && !url.hostname.endsWith('.'+base)
      if(url.origin!==portal || url.protocol!=='https:' || (!contentSite && !privateBase) || !portalSite || contentSite===portalSite)
        throw new GatewayError('invalid_gateway_configuration',503)
    }
  }
  return config
}
