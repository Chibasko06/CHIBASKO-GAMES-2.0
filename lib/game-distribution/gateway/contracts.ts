import type { GameBuildManifest } from '../types'

export type Execution = 'local' | 'online'
export type VersionStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'rejected' | 'archived'
export type DeliveryPolicy = {profile:'web-v1'|'web-isolated-v1'|'web-legacy-v1';connectOrigins:readonly string[];assetOrigins:readonly string[]}
/** Private resolver result. Never serialize this object as a launch descriptor. */
export type ResolvedGameVersion = Readonly<{
  gameId:string;versionId:string;manifest:GameBuildManifest;storagePrefix:string;contentHash:string
  status:VersionStatus;entrypoints:GameBuildManifest['client']['entrypoints'];policy:DeliveryPolicy
}>
export type GameLaunchDescriptor = Readonly<{
  gameId:string;gameVersionId:string;integrationVersion:1;execution:Execution;entrypointUrl:string
  capabilities:GameBuildManifest['capabilities'];contentOrigin:string
}>
export type GatewayConfiguration = Readonly<{publicBase:string;previewBase:string;contentBase?:string;portalOrigins:readonly string[]}>
export type PreviewRecord = {id:string;version_id:string;execution:Execution;expires_at:string}
export const PREVIEW_POLICY = Object.freeze({ticketSeconds:60,sessionSeconds:900,maxIssuePerMinute:30})
export const PREVIEW_COOKIE='__Host-cg-preview'
export class GatewayError extends Error {
  constructor(readonly code:string,readonly status=400) {super(code);this.name='GatewayError'}
}
