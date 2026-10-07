import { imageSize } from 'image-size'
import { DOMParser } from '@xmldom/xmldom'

const formats: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml',
}
const maxBytes = 8 * 1024 * 1024
const maxPixels = 40_000_000

function validateSvg(bytes: Uint8Array) {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  // No entities, active content, foreign documents or external resources.
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('SVG non autorise.')
  const document = new DOMParser({
    onError: () => { throw new Error('SVG invalide.') },
  }).parseFromString(source, 'image/svg+xml')
  if (document.documentElement?.localName !== 'svg'
    || document.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg') {
    throw new Error('SVG invalide.')
  }
  const elements = document.getElementsByTagName('*')
  for (let i = 0; i < elements.length; i++) {
    const element = elements.item(i)!
    if (element.namespaceURI !== 'http://www.w3.org/2000/svg'
      || /^(script|foreignObject|style|animate.*|set|discard|handler)$/i.test(element.localName || '')) {
      throw new Error('SVG actif non autorise.')
    }
    for (let j = 0; j < element.attributes.length; j++) {
      const attribute = element.attributes.item(j)!
      const name = (attribute.localName || attribute.name).toLowerCase()
      const value = attribute.value.trim()
      if (name.startsWith('on') || name === 'base'
        || (name === 'href' && !/^#[\w:.-]+$/.test(value))
        || /\\|\/\*|[\u0000-\u001f]|@import|expression\s*\(/i.test(value)
        || (name === 'style' && /url\s*\(/i.test(value))
        || (/url\s*\(/i.test(value) && !/^url\(\s*['"]?#[\w:.-]+['"]?\s*\)$/i.test(value))) {
        throw new Error('Ressource SVG non autorisee.')
      }
    }
  }
  // Processing instructions can load external stylesheets.
  if (/<\?(?!xml\s)/i.test(source)) throw new Error('SVG non autorise.')
}

export async function validateGameThumbnail(file: File) {
  if (file.size === 0 || file.size > maxBytes) throw new Error('Miniature vide ou superieure a 8 Mo.')
  const buffer = new Uint8Array(await file.arrayBuffer())
  try {
    const dimensions = imageSize(buffer)
    const extension = dimensions.type || ''
    const contentType = formats[extension]
    if (!contentType || contentType !== file.type) throw new Error('Format incoherent.')
    if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > maxPixels) {
      throw new Error('Dimensions invalides ou trop grandes.')
    }
    if (extension === 'svg') validateSvg(buffer)
    return { buffer, contentType, extension }
  } catch {
    throw new Error('Miniature invalide. Utilise un JPG, PNG, WEBP, GIF, AVIF ou SVG statique valide (40 megapixels maximum).')
  }
}
