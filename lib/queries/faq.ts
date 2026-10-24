import {readAllRows} from '@/lib/pagination'
import { supabase } from '../supabaseClient'
import { Tables } from '@/types/database'

export type FaqEntry = Tables<'faq_entries'>

export async function getPublishedFaqEntries() {
  return readAllRows<FaqEntry>('published_faq',(from,to)=>supabase
    .from('faq_entries')
    .select('*',{count:'exact'})
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true }).order('id').range(from,to))
}
