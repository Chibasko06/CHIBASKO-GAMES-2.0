import { parse } from 'tldts'

const platformDomains = new Set(['chibaskogames.fr', 'chibaskogames-play.fr'])
const specialSuffix = /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion|home\.arpa)$/

export class ExternalGameUrlError extends Error {
  constructor() { super('invalid_external_game_url') }
}

/** Validate a declared URL without fetching it or resolving DNS. */
export function externalGameUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\//i.test(value)
    || /[\s\\\u0000-\u001f\u007f]/u.test(value)) throw new ExternalGameUrlError()

  let url: URL
  try { url = new URL(value) } catch { throw new ExternalGameUrlError() }
  const host = url.hostname
  const authority = value.slice(8).split(/[/?#]/, 1)[0]
  const domain = parse(host, { allowPrivateDomains: false })
  if (url.protocol !== 'https:' || authority.includes('@') || url.username || url.password || url.port
    || host.endsWith('.') || specialSuffix.test(host) || domain.isIp || !domain.isIcann
    || !domain.domain || platformDomains.has(domain.domain)) throw new ExternalGameUrlError()

  return { url: url.href, origin: url.origin }
}
