import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'

type V1GameEntry = {
  title: string
  url: string
  image?: string
  categorie?: string
  developpeur?: string
  date_sortie?: string
  mobile_compatible?: string
  technologie?: string
  description?: string
}

type V1GamesMap = Record<string, V1GameEntry>

export function slugifyGameKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function parseV1GameDataFile(filePath: string) {
  const raw = await fs.readFile(filePath, 'utf8')
  const context = vm.createContext({})
  const script = new vm.Script(`${raw}\n;games;`)
  const parsed = script.runInContext(context) as V1GamesMap
  return parsed
}

export function inferImagesDirectory(filePath: string) {
  return path.resolve(path.dirname(filePath), '..', 'images')
}

export function inferProviderName(gameUrl: string) {
  try {
    const parsedUrl = new URL(gameUrl)

    if (parsedUrl.hostname.includes('gamedistribution')) {
      return 'GameDistribution'
    }

    if (parsedUrl.hostname.includes('gamemonetize')) {
      return 'GameMonetize'
    }

    return parsedUrl.hostname
  } catch {
    return null
  }
}

export function inferSourcePageUrl(gameUrl: string) {
  try {
    const parsedUrl = new URL(gameUrl)
    return parsedUrl.searchParams.get('gd_sdk_referrer_url')
  } catch {
    return null
  }
}

export async function ensurePublicGamesImage({
  imagePath,
  imagesDirectory,
  publicGamesDirectory,
  slug,
}: {
  imagePath?: string
  imagesDirectory: string
  publicGamesDirectory: string
  slug: string
}) {
  if (!imagePath) {
    return null
  }

  const sourceFileName = imagePath.replace(/^\.\/images[\\/]/, '')
  const sourceAbsolutePath = path.resolve(imagesDirectory, sourceFileName)

  try {
    await fs.access(sourceAbsolutePath)
  } catch {
    return null
  }

  await fs.mkdir(publicGamesDirectory, { recursive: true })

  const extension = path.extname(sourceAbsolutePath) || '.jpg'
  const destinationFileName = `${slug}${extension.toLowerCase()}`
  const destinationAbsolutePath = path.join(publicGamesDirectory, destinationFileName)

  await fs.copyFile(sourceAbsolutePath, destinationAbsolutePath)

  return `/games/${destinationFileName}`
}
