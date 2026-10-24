import {NextResponse} from 'next/server'

export async function POST() {
  return NextResponse.json({error: {code: 'submission_endpoint_retired', message: 'Utilise le parcours de soumission depuis /publier-un-jeu.'}},
    {status: 410, headers: {'Cache-Control': 'no-store'}})
}
