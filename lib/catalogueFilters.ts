import type { GameWithCategoriesAndStats } from './queries/games'

export type SortOption = 'popular' | 'recent' | 'title-asc' | 'title-desc'
export type DeviceFilter = 'all' | 'mobile' | 'desktop'
export type CatalogueType = 'all' | 'classic' | 'multiplayer'
export type CatalogueFilters = { type: CatalogueType; search: string; category: string; sort: SortOption; device: DeviceFilter }
export function readCatalogueFilters(params: { get(key: string): string | null }): CatalogueFilters {
  const type = params.get('type'), sort = params.get('sort'), device = params.get('device')
  return { type: type === 'classic' || type === 'multiplayer' ? type : 'all', search: params.get('search') ?? '', category: params.get('category') || 'all', sort: sort === 'recent' || sort === 'title-asc' || sort === 'title-desc' ? sort : 'popular', device: device === 'mobile' || device === 'desktop' ? device : 'all' }
}
export function catalogueQueryString(filters: CatalogueFilters) {
  const params = new URLSearchParams()
  if (filters.type !== 'all') params.set('type', filters.type)
  if (filters.search) params.set('search', filters.search)
  if (filters.category !== 'all') params.set('category', filters.category)
  if (filters.sort !== 'popular') params.set('sort', filters.sort)
  if (filters.device !== 'all') params.set('device', filters.device)
  const query = params.toString()
  return '/games' + (query ? '?' + query : '')
}
function normalizeCompatibility(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getCompatibilityBucket(value: string | null | undefined): DeviceFilter | 'unknown' {
  const normalized = normalizeCompatibility(value)

  if (!normalized) {
    return 'unknown'
  }

  const mobilePatterns = ['yes', 'oui', 'true', 'mobile', 'smartphone', 'touch', 'tactile', 'compatible']
  const desktopPatterns = ['no', 'non', 'false', 'pc', 'desktop', 'ordinateur', 'clavier', 'souris']

  const mobileScore = mobilePatterns.filter((pattern) => normalized.includes(pattern)).length
  const desktopScore = desktopPatterns.filter((pattern) => normalized.includes(pattern)).length

  if (desktopScore > mobileScore) {
    return 'desktop'
  }

  if (mobileScore > desktopScore) {
    return 'mobile'
  }

  return 'unknown'
}


export function filterCatalogue(games: GameWithCategoriesAndStats[], filters: CatalogueFilters) {
  const { type, category: selectedCategory, device: deviceFilter, sort } = filters
  const normalizedQuery = filters.search.trim().toLowerCase()
  return games
    .filter((game) => {
      if (type !== 'all' && game.game_type !== (type === 'multiplayer' ? 'multiplayer_chibasko' : 'classic')) return false
      const compatibilityBucket = getCompatibilityBucket(game.mobile_compatible)
      const matchesCategory =
        selectedCategory === 'all' ||
        game.categories.some((category) => category.slug === selectedCategory)

      if (!matchesCategory) {
        return false
      }

      const matchesDeviceFilter =
        deviceFilter === 'all' ||
        compatibilityBucket === deviceFilter

      if (!matchesDeviceFilter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      const haystack = [
        game.title,
        game.description,
        game.developer_name,
        game.technology,
        ...game.categories.map((category) => category.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
    .sort((left, right) => {
      if (sort === 'recent') {
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      }

      if (sort === 'title-asc') {
        return left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' })
      }

      if (sort === 'title-desc') {
        return right.title.localeCompare(left.title, 'fr', { sensitivity: 'base' })
      }

      if ((right.views_count ?? 0) !== (left.views_count ?? 0)) {
        return (right.views_count ?? 0) - (left.views_count ?? 0)
      }

      return (right.likes_count ?? 0) - (left.likes_count ?? 0)
    })

}
