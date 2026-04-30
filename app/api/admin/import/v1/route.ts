import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../_utils'
import {
  ensurePublicGamesImage,
  inferImagesDirectory,
  inferProviderName,
  inferSourcePageUrl,
  parseV1GameDataFile,
  slugifyGameKey,
} from '@/lib/v1Import'

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  const body = await request.json()

  const dataFilePath = body.dataFilePath as string | undefined
  const imagesDirectoryPath = body.imagesDirectoryPath as string | undefined

  if (!dataFilePath) {
    return NextResponse.json({ error: 'Missing dataFilePath' }, { status: 400 })
  }

  try {
    const v1Games = await parseV1GameDataFile(dataFilePath)
    const imagesDirectory = imagesDirectoryPath || inferImagesDirectory(dataFilePath)
    const publicGamesDirectory = path.join(process.cwd(), 'public', 'games')

    let importedCount = 0
    let copiedImagesCount = 0
    const missingImages: string[] = []
    const categoryCache = new Map<string, string>()

    for (const [key, game] of Object.entries(v1Games)) {
      const slug = slugifyGameKey(key)

      const thumbnailUrl = await ensurePublicGamesImage({
        imagePath: game.image,
        imagesDirectory,
        publicGamesDirectory,
        slug,
      })

      if (game.image && !thumbnailUrl) {
        missingImages.push(game.image)
      }

      if (thumbnailUrl) {
        copiedImagesCount += 1
      }

      const payload = {
        title: game.title,
        slug,
        game_url: game.url,
        thumbnail_url: thumbnailUrl,
        description: game.description || null,
        developer_name: game.developpeur || null,
        release_date_text: game.date_sortie || null,
        mobile_compatible: game.mobile_compatible || null,
        technology: game.technologie || null,
        provider_name: inferProviderName(game.url),
        source_page_url: inferSourcePageUrl(game.url),
        is_published: true,
      }

      const { data: upsertedGame, error: gameError } = await supabaseAdmin
        .from('games')
        .upsert(payload, { onConflict: 'slug' })
        .select('id')
        .single()

      if (gameError) {
        return NextResponse.json({ error: gameError.message, failedGame: game.title }, { status: 500 })
      }

      if (game.categorie) {
        const categoryName = game.categorie.trim()
        const categorySlug = slugifyGameKey(categoryName)
        let categoryId = categoryCache.get(categorySlug)

        if (!categoryId) {
          const { data: categoryData, error: categoryError } = await supabaseAdmin
            .from('categories')
            .upsert(
              {
                name: categoryName,
                slug: categorySlug,
              },
              { onConflict: 'slug' }
            )
            .select('id')
            .single()

          if (categoryError) {
            return NextResponse.json({ error: categoryError.message, failedGame: game.title }, { status: 500 })
          }

          categoryId = categoryData.id
          categoryCache.set(categorySlug, categoryId)
        }

        const { error: relationError } = await supabaseAdmin
          .from('game_categories')
          .upsert(
            {
              game_id: upsertedGame.id,
              category_id: categoryId,
            },
            { onConflict: 'game_id,category_id' }
          )

        if (relationError) {
          return NextResponse.json({ error: relationError.message, failedGame: game.title }, { status: 500 })
        }
      }

      importedCount += 1
    }

    return NextResponse.json({
      importedCount,
      copiedImagesCount,
      missingImages,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown import error',
      },
      { status: 500 }
    )
  }
}
