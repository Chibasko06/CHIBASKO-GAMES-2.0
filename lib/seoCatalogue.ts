import type {Category, GameWithCategoriesAndStats} from './queries/games'
import {absoluteUrl, buildPageMetadata} from './seo'

export function categoryPath(slug:string) {
  return '/games?category='+encodeURIComponent(slug)
}

const categoryIntroductions:Record<string,string>={
  action:'Réflexes, combats et défis rapides : retrouve les jeux d’action disponibles dans le navigateur.',
  arcade:'Des parties courtes et des défis de précision : découvre les jeux d’arcade du catalogue.',
  sport:'Précision, rythme et compétition : parcours les jeux de sport disponibles sur la plateforme.',
  sports:'Précision, rythme et compétition : parcours les jeux de sport disponibles sur la plateforme.',
  racing:'Courses et maîtrise des trajectoires : découvre les jeux de conduite du catalogue.',
  conduite:'Courses et maîtrise des trajectoires : découvre les jeux de conduite du catalogue.',
  puzzle:'Observe, combine et résous les défis proposés par les jeux de réflexion du catalogue.',
}

export function categoryDescription(category:Pick<Category,'name'|'slug'>) {
  return categoryIntroductions[category.slug] || `Explore la sélection ${category.name} de Chibasko Games et choisis un jeu à découvrir directement dans ton navigateur.`
}

export function categoryMetadata(category:Category) {
  return buildPageMetadata({title:`Jeux ${category.name} gratuits`, description:categoryDescription(category),path:categoryPath(category.slug)})
}

export function gameDescription(game:Pick<GameWithCategoriesAndStats,'title'|'description'>) {
  const text=(game.description??'').replace(/\s+/g,' ').trim()
  const description=text || `Découvre ${game.title}, un jeu gratuit à lancer dans ton navigateur sur Chibasko Games.`
  return description.length>180 ? description.slice(0,177).trimEnd()+'…' : description
}

export function gameMetadata(game:GameWithCategoriesAndStats) {
  return buildPageMetadata({title:`${game.title} - Jeu gratuit en ligne`,description:gameDescription(game),path:`/games/${game.slug}`,image:game.thumbnail_url??undefined,imageAlt:game.title})
}

export function gameStructuredData(game:GameWithCategoriesAndStats) {
  return {
    '@context':'https://schema.org',
    '@graph':[
      {
        '@type':'VideoGame', name:game.title,
        description:game.description?.trim() || gameDescription(game),
        url:absoluteUrl(`/games/${game.slug}`),
        image:game.thumbnail_url || absoluteUrl('/chibaskogames-logo.png'),
        genre:game.categories.map(category=>category.name),
        author:game.developer_name?{'@type':'Organization',name:game.developer_name}:undefined,
      },
      {
        '@type':'BreadcrumbList',itemListElement:[
          {'@type':'ListItem',position:1,name:'Accueil',item:absoluteUrl('/')},
          {'@type':'ListItem',position:2,name:'Jeux',item:absoluteUrl('/games')},
          {'@type':'ListItem',position:3,name:game.title,item:absoluteUrl(`/games/${game.slug}`)},
        ],
      },
    ],
  }
}
