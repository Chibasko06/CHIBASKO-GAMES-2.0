import {adComfortVisible} from '@/lib/server/adComfort'
import AdComfortMessage from './AdComfortMessage'
export default async function AdComfortBanner(){
 if(!await adComfortVisible())return null
 return <AdComfortMessage/>
}
