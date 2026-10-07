import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'
import { InputError, readJsonObject } from '@/lib/server/inputValidation'
import { validateGameSubmission } from '@/lib/server/gameSubmissionValidation'

export async function POST(request: NextRequest) {
  try {
    const payload = validateGameSubmission(await readJsonObject(request, 32_768))
    const { error } = await getSupabaseAdminClient().from('game_submissions').insert(payload)
    if (error) throw error
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Game submission could not be saved')
    return NextResponse.json({ error: 'Impossible d envoyer la proposition. Reessaie plus tard.' }, { status: 503 })
  }
}
