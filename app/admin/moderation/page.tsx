import Moderation from '@/components/admin/Moderation'
export const dynamic='force-dynamic'
export default async function ModerationPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const query=await searchParams,id=query.target,kind=query.kind,subject=query.subject
 const directTarget=typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)&&(kind==='player'||kind==='game')?{id,kind:kind as 'player'|'game'}:typeof subject==='string'&&/^[a-f0-9-]{36}$/i.test(subject)?{id:subject,kind:'player' as const,subject}:undefined
 const caseId=typeof query.id==='string'&&/^[a-f0-9-]{36}$/i.test(query.id)?query.id:''
 const measureId=typeof query.measure==='string'&&/^[a-f0-9-]{36}$/i.test(query.measure)?query.measure:undefined
 const appealId=typeof query.appeal==='string'&&/^[a-f0-9-]{36}$/i.test(query.appeal)?query.appeal:undefined
 const linkedCase=typeof query.caseId==='string'&&/^[a-f0-9-]{36}$/i.test(query.caseId)?query.caseId:undefined
 const view=query.view==='measures'||query.view==='appeals'?query.view:'reports'
 const initialAction=query.action==='lift'||query.action==='restore'?query.action:undefined
 return <Moderation key={view+(caseId||directTarget?.id||measureId||appealId||'moderation')} view={view} measureId={measureId} appealId={appealId} caseId={linkedCase} initialAction={initialAction} measuresEnabled={process.env.MODERATION_MEASURES_ENABLED==='1'} directTarget={directTarget}/>
}
