import { supabase } from '../supabaseClient'
import { Tables } from '@/types/database'

export type FaqEntry = Tables<'faq_entries'>

export async function getPublishedFaqEntries() {
  const { data } = await supabase
    .from('faq_entries')
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  return data ?? []
}
