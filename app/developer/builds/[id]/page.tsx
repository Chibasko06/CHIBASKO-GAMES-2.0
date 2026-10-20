import BuildReviewStatus from '@/components/BuildReviewStatus'
export default async function Page({params}:{params:Promise<{id:string}>}){return <BuildReviewStatus id={(await params).id}/>}
