/** Canonical relative URL path. Never normalize attacker-controlled paths. */
export function assertArtifactPath(path: string): void {
  if (typeof path !== 'string' || path.normalize('NFC') !== path || new TextEncoder().encode(path).length > 512
    || /[\\%?#:\u0000-\u001f\u007f<>"|*]/.test(path)) throw new Error('UNSAFE_ARTIFACT_PATH')
  const parts = path.split('/')
  if (parts.some(part => !part || part.startsWith('.') || /[. ]$|^ /.test(part)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    || part.toLowerCase() === '__macosx' || part.toLowerCase() === 'node_modules')) throw new Error('UNSAFE_ARTIFACT_PATH')
  if (/\.(?:exe|dll|so|dylib|php\d*|phtml|asp|aspx|jsp|sh|bat|cmd|ps1|pem|key|p12|pfx)$/i.test(path)
    || /(?:^|\/)(?:_headers|_redirects|Dockerfile)$/i.test(path)) throw new Error('FORBIDDEN_ARTIFACT_FILE')
}
export function artifactMedia(path: string): { contentType: string; contentEncoding?: 'gzip' | 'br' } {
  const compressed = /\.(gz|br)$/.exec(path)
  const base = compressed ? path.slice(0, -compressed[0].length) : path
  const extension = base.split('.').at(-1)?.toLowerCase() ?? ''
  const types: Record<string, string> = {
    html:'text/html; charset=utf-8', js:'text/javascript; charset=utf-8', mjs:'text/javascript; charset=utf-8', css:'text/css; charset=utf-8',
    json:'application/json', wasm:'application/wasm', svg:'image/svg+xml', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
    webp:'image/webp', avif:'image/avif', gif:'image/gif', ico:'image/x-icon', woff:'font/woff', woff2:'font/woff2',
    mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav', mp4:'video/mp4', webm:'video/webm', txt:'text/plain; charset=utf-8',
  }
  return { contentType: types[extension] ?? 'application/octet-stream', ...(compressed ? { contentEncoding: compressed[1] === 'gz' ? 'gzip' as const : 'br' as const } : {}) }
}
