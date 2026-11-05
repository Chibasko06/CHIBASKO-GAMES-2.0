import {readData} from '@/lib/dataAccess'
import type { GameCapabilities } from '@chibaskogames/sdk'
import type { GameType } from '@/lib/multiplayer/catalogue'
export { isClassicGame, isChibaskoMultiplayerGame } from '@/lib/multiplayer/catalogue'
import { Tables } from '@/types/database'
import { supabase } from '../supabaseClient'
import {DataAccessError} from '../dataAccess'
import {readAllRows} from '../pagination'
import type {CatalogueFilters} from '../catalogueFilters'

export type Game = Tables<'games'> & {runtime_capabilities?: GameCapabilities}
export type Category = Tables<'categories'>

export type GamePublicStat = {
  game_id: string
  favorites_count: number
  ratings_count: number
  average_rating: number
  comments_count: number
  likes_count: number
  dislikes_count: number
}

export type GameWithCategories = Game & {
  categories: Category[]
}

export type GameWithCategoriesAndStats = GameWithCategories & GamePublicStat

export type HomepageHighlight = {
  label: string
  description: string
  game: GameWithCategoriesAndStats
}

export async function getCategories(){
 return readAllRows<Category>('categories',(from,to)=>supabase.from('categories').select('*',{count:'exact'}).order('name').order('id').range(from,to))
}

export type CataloguePage={items:GameWithCategoriesAndStats[];total:number}
export async function getCataloguePage(options:Partial<CatalogueFilters>&{offset?:number;limit?:number;slug?:string;ranking?:string}={}):Promise<CataloguePage>{
 const {data}=await readData('catalogue_page',supabase.rpc('catalogue_page' as never,{
  p_search:options.search??'',p_category:options.category??'all',p_type:options.type??'all',p_device:options.device??'all',
  p_sort:options.ranking??options.sort??'popular',p_offset:options.offset??0,p_limit:options.limit??24,p_slug:options.slug??null,
 } as never))
 const page=data as unknown as CataloguePage
 if(!page||!Array.isArray(page.items)||!Number.isSafeInteger(page.total)||page.total<0||page.items.length>(options.limit??24))throw new DataAccessError('unexpected_error')
 return page
}

// Réservé aux traitements exhaustifs ; les écrans utilisent getCataloguePage.
export async function getGamesCatalog(type?:GameType){
 const rows:GameWithCategoriesAndStats[]=[]
 let total=0
 do{
  const page=await getCataloguePage({type:type==='multiplayer_chibasko'?'multiplayer':type==='classic'?'classic':'all',sort:'recent',offset:rows.length,limit:100})
  total=page.total
  if(total>50000||(!page.items.length&&rows.length<total))throw new DataAccessError('database_unavailable')
  rows.push(...page.items)
 }while(rows.length<total)
 return rows
}
export async function getGamePublicStats(gameId?:string){
 if(!gameId)return readAllRows<GamePublicStat>('game_public_stats',(from,to)=>supabase.rpc('get_game_public_stats',undefined,{count:'exact'}).order('game_id').range(from,to))
 const {data}=await readData('game_public_stats',supabase.rpc('catalogue_game_stats' as never,{p_ids:[gameId]} as never))
 return (data??[]) as GamePublicStat[]
}
export async function getGames(){return (await getGamesCatalog()).sort((a,b)=>(b.views_count??0)-(a.views_count??0)||b.likes_count-a.likes_count||b.average_rating-a.average_rating||a.id.localeCompare(b.id))}
export async function getFeaturedGames(limit=8){return (await getCataloguePage({limit})).items}
export async function getHomepageHighlights(){
 const rankings=['popular','favorites','likes','rating','recent']
 const rows=await Promise.all(rankings.map(ranking=>getCataloguePage({ranking,limit:1})))
 if(rows[3].items[0]&&!rows[3].items[0].ratings_count)rows[3]=rows[0]
 const labels=['Le plus vu','Le plus en favori','Le plus like','Meilleure note','Selection equipe']
 return rows.flatMap((page,i)=>page.items.map(game=>({label:labels[i],description:i===0?`${game.views_count} vues`:i===1?`${game.favorites_count} favoris`:i===2?`${game.likes_count} likes`:i===3?`${Number(game.average_rating).toFixed(1)} / 5`:'Choix du moment',game}))) satisfies HomepageHighlight[]
}
export async function getGamesByCategory(limitPerCategory=10){
 const {data}=await readData('catalogue_home',supabase.rpc('catalogue_home' as never,{p_limit:limitPerCategory} as never))
 if(!Array.isArray(data))throw new DataAccessError('unexpected_error')
 return data as {category:Category;games:GameWithCategoriesAndStats[]}[]
}
export async function getGameBySlug(slug:string){return (await getCataloguePage({slug,limit:1})).items[0]??null}
export async function getGameRecommendations(game:GameWithCategories){
 const rows=await Promise.all((game.categories.length?game.categories:[null]).map(category=>getCataloguePage({category:category?.slug??'all',limit:6})))
 return rows.flatMap(page=>page.items)
}
export async function getGameReviews(gameId:string){
 return readAllRows<{id:string;user_id:string;username:string;avatar_url:string|null;rating:number;comment:string;created_at:string;updated_at:string}>('game_reviews',(from,to)=>supabase.rpc('get_game_reviews',{p_game_id:gameId},{count:'exact'}).order('updated_at',{ascending:false}).order('id').range(from,to))
}

export async function getGameReviewsPage(gameId:string,page=1){
 const [{data,count},stats]=await Promise.all([
  readData('game_reviews_page',supabase.rpc('get_game_reviews',{p_game_id:gameId},{count:'exact'}).order('updated_at',{ascending:false}).order('id').range((page-1)*20,page*20-1)),
  getGamePublicStats(gameId),
 ])
 if(count===null)throw new DataAccessError('unexpected_error')
 return {items:data??[],total:count,average:Number(stats[0]?.average_rating??0)}
}

export async function getSitemapGames(){
 return readAllRows<{id:string;slug:string;is_published:boolean;game_categories:{category_id:string}[]}>('sitemap_games',(from,to)=>supabase.from('games').select('id, slug, is_published, game_categories(category_id)',{count:'exact'}).eq('is_published',true).order('id').range(from,to))
}
