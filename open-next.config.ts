import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// No R2, KV or paid image service is needed for this first preview.
export default defineCloudflareConfig()
