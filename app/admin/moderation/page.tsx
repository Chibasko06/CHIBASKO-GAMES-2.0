import Moderation from '@/components/admin/Moderation'
export const dynamic='force-dynamic'
export default async function ModerationPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const query=await searchParams,id=query.target,kind=query.kind,subject=query.subject
 const directTarget=typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)&&(kind==='player'||kind==='game')?{id,kind:kind as 'player'|'game'}:typeof subject==='string'&&/^[a-f0-9-]{36}$/i.test(subject)?{id:subject,kind:'player' as const,subject}:undefined
 const caseId=typeof query.id==='string'&&/^[a-f0-9-]{36}$/i.test(query.id)?query.id:''
 return <Moderation key={caseId||directTarget?.id||'moderation'} measuresEnabled={process.env.MODERATION_MEASURES_ENABLED==='1'} directTarget={directTarget}/>
}
