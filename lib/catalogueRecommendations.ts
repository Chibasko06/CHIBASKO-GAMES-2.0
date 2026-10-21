import type {Category,GameWithCategoriesAndStats} from './queries/games'
type Candidate=Pick<GameWithCategoriesAndStats,'id'|'slug'|'title'|'thumbnail_url'|'is_published'> & {categories:readonly Pick<Category,'id'|'name'|'slug'>[]}
export function selectGameRecommendations(current:Pick<Candidate,'id'|'categories'>,catalogue:readonly Candidate[]):Candidate[]{
 const primary=current.categories[0]?.id,shared=new Set(current.categories.map(category=>category.id)),seen=new Set<string>()
 return catalogue.filter(game=>{
  if(game.id===current.id || !game.is_published || seen.has(game.id))return false
  seen.add(game.id);return !shared.size || game.categories.some(category=>shared.has(category.id))
 }).map(game=>({game,rank:primary && game.categories.some(category=>category.id===primary)?1:0}))
 .sort((left,right)=>right.rank-left.rank).slice(0,5).map(({game})=>game)
}
export type GameRecommendation=Candidate
