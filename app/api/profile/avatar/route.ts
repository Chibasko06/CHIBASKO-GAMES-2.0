import {NextRequest} from 'next/server'
import {AvatarUpdateError, replaceAvatarForUser, updateAvatarForUser} from '@/lib/server/avatarStorage'
import {profileIdentity, profileFailure} from '@/lib/server/profileRequest'
import {adminJson} from '@/lib/server/adminResponses'
import {InputError} from '@/lib/server/inputValidation'

export async function POST(request: NextRequest) {
  try {
    const {db, user} = await profileIdentity(request)
    let form: FormData
    try { form = await request.formData() } catch { throw new InputError('Formulaire avatar invalide.') }
    const file = form.get('file')
    // A legacy userId field is ignored; ownership always comes from verified Auth.
    if (!(file instanceof File) || form.getAll('file').length !== 1 || Array.from(form.keys()).some(key => !['file', 'userId'].includes(key))) {
      return adminJson({error: 'Fichier avatar invalide.'}, {status: 400})
    }
    const profile = await replaceAvatarForUser(user.id, file, db)
    return adminJson({avatarUrl: profile.avatar_url, profile})
  } catch (error) {
    if (error instanceof AvatarUpdateError) return adminJson({error: error.message}, {status: error.status})
    return profileFailure('profile_avatar_upload', error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const {db, user} = await profileIdentity(request)
    const profile = await updateAvatarForUser(user.id, null, db)
    return adminJson({avatarUrl: null, profile})
  } catch (error) {
    if (error instanceof AvatarUpdateError) return adminJson({error: error.message}, {status: error.status})
    return profileFailure('profile_avatar_delete', error)
  }
}
