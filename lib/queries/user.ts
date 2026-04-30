import { supabase } from '../supabaseClient'

export async function signUp(email: string, password: string) {
  return await supabase.auth.signUp({ email, password })
}

export async function signIn(email: string, password: string) {
  return await supabase.auth.signInWithPassword({ email, password })
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}