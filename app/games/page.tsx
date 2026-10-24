import type { Metadata } from 'next'
import GamesCatalog from '@/components/GamesCatalog'
import { getCategories, getCataloguePage } from '@/lib/queries/games'
import {readCatalogueFilters} from '@/lib/catalogueFilters'
import {pageNumber} from '@/lib/pagination'
import { buildPageMetadata } from '@/lib/seo'
import {categoryDescription, categoryMetadata} from '@/lib/seoCatalogue'
import {cache} from 'react'

export const dynamic = 'force-dynamic'
const getCatalogueCategories=cache(getCategories)
const getCatalogue=cache((serialized:string)=>{const params=new URLSearchParams(serialized);return getCataloguePage({...readCatalogueFilters(params),offset:(pageNumber(params.get('page'))-1)*24})})
function parameters(query:Record<string,string|string[]|undefined>){return new URLSearchParams(Object.entries(query).filter((entry):entry is [string,string]=>typeof entry[1]==='string')).toString()}
const catalogueMetadata: Metadata = buildPageMetadata({
  title: 'Catalogue de jeux gratuits en ligne',
  description:
    'Parcours le catalogue de jeux gratuits de Chibasko Games avec recherche, categories, tri et filtres pour trouver ton prochain jeu navigateur.',
  path: '/games',
})

type Props={searchParams:Promise<Record<string,string|string[]|undefined>>}
export async function generateMetadata({searchParams}:Props):Promise<Metadata>{
  const query=await searchParams
  const categories=await getCatalogueCategories()
  const category=categories.find(category=>category.slug===query.category)
  let metadata=category?categoryMetadata(category):catalogueMetadata
  const page=pageNumber(query.page)
  if(page>1){const path='/games?'+new URLSearchParams({...category?{category:category.slug}:{},page:String(page)});metadata=buildPageMetadata({title:String(metadata.title)+` — Page ${page}`,description:String(metadata.description),path})}
  const emptyCategory=category && (await getCatalogue(parameters(query))).total===0
  // Search results and arbitrary filter combinations are not category landing pages.
  return emptyCategory || Object.entries(query).some(([key])=>['search','type','device','sort'].includes(key)) || (query.category && query.category!=='all' && !category)
    ? {...metadata,robots:{index:false,follow:true}} : metadata
}

export default async function GamesPage({searchParams}:Props) {
  const query=await searchParams
  const [games, categories] = await Promise.all([
    getCatalogue(parameters(query)),
    getCatalogueCategories(),
  ])
  const category=categories.find(category=>category.slug===query.category)

  return (
    <div className="space-y-6 2xl:space-y-8">
      <div>
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{category?`Jeux ${category.name}`:'Tous les jeux'}</h1>
        <p className="mb-6 max-w-3xl text-zinc-500">
          {category?categoryDescription(category):'Explore le catalogue des jeux gratuits publiés sur Chibasko Games. Recherche, catégories et tri t’aident à trouver ton prochain jeu navigateur.'}
        </p>
      </div>

      <GamesCatalog games={games.items} categories={categories} total={games.total} page={pageNumber(query.page)} />
    </div>
  )
}
