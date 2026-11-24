import BuildReviews from '@/components/admin/BuildReviews'
export default async function Page({searchParams}:{searchParams:Promise<{view?:string;revision?:string}>}){const query=await searchParams;return <BuildReviews queue={query.view==='review'||query.view==='validation'?query.view:undefined} revisionId={query.revision}/>}
