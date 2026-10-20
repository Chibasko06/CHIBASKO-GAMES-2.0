import BuildReviews from '@/components/admin/BuildReviews'
export default async function Page({params}:{params:Promise<{id:string}>}){return <BuildReviews id={(await params).id}/>}
