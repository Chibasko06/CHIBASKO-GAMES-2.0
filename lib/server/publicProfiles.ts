import 'server-only'
import {createServerSupabase} from '@/lib/server/supabaseSession'
import {getCommunityProfilesPage,resolvePublicProfile} from '@/lib/queries/profiles'

// Le JWT du visiteur est transmis aux projections SQL ; aucun résultat personnel
// n'est conservé entre deux requêtes ni résolu avec un client serveur partagé.
export async function resolveViewerProfile(identifier:string){
 return resolvePublicProfile(identifier,await createServerSupabase())
}
export async function getViewerProfilesPage(search:string,page:number,role:string){
 return getCommunityProfilesPage(search,page,role,null,await createServerSupabase())
}
