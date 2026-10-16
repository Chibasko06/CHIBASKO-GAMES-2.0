import { UPLOAD_POLICY, UploadError, assertUploadId, expectedPartSize } from './policy'
import { publicUpload, type Upload, type UploadRepository, type StagingStorage } from './contracts'
import { validateManifest } from '../manifest'

/** All operations, including status/parts, authorize through the DB using verified actor. */
export function createUploadService(db: UploadRepository, storage: StagingStorage) {
  const get = (actor: string, id: string) => {
    assertUploadId(id)
    return db.call<Upload>('distribution_get_upload', {p_actor:actor,p_id:id})
  }
  return {
    async create(actor: string, gameId: string, body: Record<string,unknown>, idempotency: string) {
      assertUploadId(gameId); assertUploadId(idempotency)
      if (Object.keys(body).some(key => !['version','archiveSize'].includes(key))
        || typeof body.version !== 'string' || !Number.isSafeInteger(body.archiveSize)
        || Number(body.archiveSize) < 1 || Number(body.archiveSize) > UPLOAD_POLICY.maxArchiveBytes) throw new UploadError('invalid_request')
      // Reuse the canonical SemVer/schema rules, no independent version regex.
      try { validateManifest({schemaVersion:1,gameId,version:body.version,integrationVersion:1,
        capabilities:{local:{players:{min:1,max:1}}},client:{entrypoints:{local:'index.html'}}},{gameId,version:body.version}) }
      catch { throw new UploadError('invalid_version') }
      let row = await db.call<Upload>('distribution_create_upload', {p_actor:actor,p_game:gameId,p_version:body.version,
        p_size:body.archiveSize,p_request:idempotency,p_policy:UPLOAD_POLICY})
      if (row.status === 'created') {
        const multipart = await storage.begin(row.staging_key)
        try {
          row = await db.call<Upload>('distribution_attach_transport',{p_actor:actor,p_id:row.id,p_multipart:multipart})
          if (row.multipart_id !== multipart) await storage.abort(row.staging_key,multipart)
        } catch (error) { await storage.abort(row.staging_key,multipart).catch(()=>{}); throw error }
      }
      return publicUpload(row)
    },
    async status(actor: string, id: string) { return publicUpload(await get(actor,id)) },
    async parts(actor: string, id: string, numbers?: unknown) {
      const row = await get(actor,id)
      if (row.status === 'expired') throw new UploadError('upload_expired',410)
      if (row.status !== 'uploading' || !row.multipart_id) throw new UploadError('invalid_state',409)
      if (!numbers) return {parts:await storage.parts(row.staging_key,row.multipart_id)}
      if (!Array.isArray(numbers) || !numbers.length || numbers.length > 32 || new Set(numbers).size !== numbers.length) throw new UploadError('invalid_request')
      const seconds = Math.max(1,Math.min(row.policy.signedUrlSeconds,Math.floor((Date.parse(row.expires_at)-Date.now())/1000)))
      const parts = []
      for (const number of numbers) {
        const size = expectedPartSize(row.expected_size,number,row.policy.partBytes)
        parts.push({number,size,method:'PUT',headers:{'Content-Length':String(size)},
          url:await storage.signPart(row.staging_key,row.multipart_id,number,size,seconds)})
      }
      return {parts,expiresIn:seconds}
    },
    async finalize(actor: string, id: string) {
      const current=await get(actor,id)
      if(current.status==='expired')throw new UploadError('upload_expired',410)
      if(['created','failed'].includes(current.status))throw new UploadError('invalid_state',409)
      const row = await db.call<Upload>('distribution_begin_finalize',{p_actor:actor,p_id:id})
      if (!['uploading','finalizing'].includes(row.status)) return publicUpload(row)
      if (!row.multipart_id) throw new UploadError('invalid_state',409)
      // Completion can have succeeded before a lost HTTP response or process crash.
      if (!await storage.head(row.staging_key)) {
        const parts = await storage.parts(row.staging_key,row.multipart_id)
        if (parts.length !== Math.ceil(row.expected_size/row.policy.partBytes)
          || parts.some((p,i)=>p.number!==i+1 || p.size!==expectedPartSize(row.expected_size,p.number,row.policy.partBytes))) {
          await db.call('distribution_resume_upload',{p_actor:actor,p_id:id})
          throw new UploadError('upload_incomplete',409)
        }
        try { await storage.complete(row.staging_key,row.multipart_id,parts) }
        catch (error) { if (!await storage.head(row.staging_key)) throw error }
      }
      const object = await storage.head(row.staging_key)
      if (!object || object.size !== row.expected_size) throw new UploadError('upload_incomplete',409)
      // Atomically records the immutable assembled object ETag and an outbox entry.
      return publicUpload(await db.call<Upload>('distribution_enqueue_upload',{p_actor:actor,p_id:id,p_etag:object.etag}))
    },
  }
}
