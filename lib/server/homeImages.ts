import 'server-only'
import type {CatalogueImage} from '../catalogueImages'

// Replaced at compilation; no filesystem or image transformation runs in Workers.
const images:Record<string,CatalogueImage>=JSON.parse(process.env.CHIBASKO_CATALOGUE_IMAGES??'{}')
export function withHomeImage<T extends {thumbnail_url:string|null}>(game:T):T&{thumbnail_image?:CatalogueImage}{
 return {...game,thumbnail_image:game.thumbnail_url?images[game.thumbnail_url]:undefined}
}
