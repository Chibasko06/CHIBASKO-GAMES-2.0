import {NextRequest} from 'next/server'
import {readJsonObject} from '@/lib/server/inputValidation'
import {profileFields, profileIdentity, profileFailure} from '@/lib/server/profileRequest'
import {adminJson} from '@/lib/server/adminResponses'

export async function PATCH(request: NextRequest) {
  try {
    const {db, user} = await profileIdentity(request)
    const fields = profileFields(await readJsonObject(request))
    const {data, error} = await db.from('profiles').update(fields).eq('id', user.id)
      .select('id, username, display_name, avatar_url, bio, created_at').single()
    if (error) throw error
    return adminJson({profile: data})
  } catch (error) { return profileFailure('profile_update', error) }
}
