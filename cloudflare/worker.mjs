// Cloudflare entrypoint wrapping the OpenNext handler; separate from the standard Next.js build.
import handler from '../.open-next/worker.js'
import { previewHandler } from './preview.mjs'
import { securityHandler } from './security.mjs'

export default securityHandler(previewHandler(handler))
