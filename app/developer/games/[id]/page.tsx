import DeveloperWorkspace from '@/components/DeveloperWorkspace'
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <DeveloperWorkspace gameId={id}/>}
