import type { DeliveryPolicy, GatewayConfiguration } from './contracts'

/** Approved profiles only; no header strings are ever read from a game manifest. */
export function gameSecurityHeaders(policy:DeliveryPolicy,config:GatewayConfiguration) {
  const assets=policy.assetOrigins.join(' '),connect=policy.connectOrigins.join(' ')
  const evalPermission=policy.profile==='web-legacy-v1'?"'unsafe-eval'":"'wasm-unsafe-eval'"
  return new Headers({
    'Content-Security-Policy':[
      "default-src 'none'",`script-src 'self' 'unsafe-inline' blob: ${evalPermission} ${assets}`,
      `style-src 'self' 'unsafe-inline' ${assets}`,`img-src 'self' data: blob: ${assets}`,
      `font-src 'self' data: ${assets}`,`media-src 'self' blob: ${assets}`,`connect-src 'self' ${connect}`,
      "worker-src 'self' blob:","object-src 'none'","base-uri 'none'","form-action 'none'","frame-src 'none'",
      'frame-ancestors '+config.portalOrigins.join(' '),"sandbox allow-scripts allow-same-origin allow-pointer-lock",
    ].join('; '),
    'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin',
    'Cross-Origin-Opener-Policy':'same-origin',
    'Cross-Origin-Embedder-Policy':policy.profile==='web-isolated-v1'?'require-corp':'unsafe-none',
    'Origin-Agent-Cluster':'?1',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self), autoplay=(self), gamepad=(self), cross-origin-isolated=(self)',
  })
}
