import {useSyncExternalStore} from 'react'
import {createRoot} from 'react-dom/client'
import AdminPage from '../../app/admin/page'
import BuildReviews from '../../components/admin/BuildReviews'
import AccountDeletions from '../../components/admin/AccountDeletions'

function Fixture(){
 const path=useSyncExternalStore(callback=>{window.addEventListener('popstate',callback);return()=>window.removeEventListener('popstate',callback)},()=>location.pathname)
 return <main className="mx-auto w-full max-w-[2200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10 2xl:px-12">{path.startsWith('/admin/account-deletions')?<AccountDeletions/>:path.startsWith('/admin/game-builds')?<BuildReviews id={path.split('/')[3]}/>:<AdminPage/>}</main>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
