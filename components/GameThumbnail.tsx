import Image,{type ImageProps} from 'next/image'
import type {CatalogueImage} from '@/lib/catalogueImages'

type Props=Omit<ImageProps,'src'|'loader'>&{src:string;image?:CatalogueImage}
export default function GameThumbnail({image,src,priority,alt,...props}:Props){
 if(!image)return <Image {...props} alt={alt} src={src} priority={priority}/>
 // The browser selects static WebP derivatives; no Next optimizer is needed.
 // Avoid preloading the fallback src independently of the picture's srcset.
 return <picture>
  <source type="image/webp" srcSet={image.srcSet} sizes={props.sizes}/>
  <Image {...props} alt={alt} src={image.src} unoptimized loading={priority?'eager':props.loading??'lazy'} fetchPriority={priority?'high':undefined}/>
 </picture>
}
