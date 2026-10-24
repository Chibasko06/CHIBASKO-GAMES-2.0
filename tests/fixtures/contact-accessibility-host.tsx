import {createRoot} from 'react-dom/client'
import ContactPageClient from '../../components/ContactPageClient'
import GameReviews from '../../components/GameReviews'
import Login from '../../app/login/page'
import Register from '../../app/register/page'
import Reset from '../../app/reset-password/page'
import UserDropdown from '../../components/UserDropdown'
import {Navbar} from '../../components/Navbar'
const kind=new URLSearchParams(location.search).get('kind')
const view=kind==='reviews'?<GameReviews gameId="fixture-game"/>:kind==='login'?<Login/>:kind==='register'?<Register/>:kind==='reset'?<Reset/>:kind==='account'?<><UserDropdown isAdmin={false} user={{id:'fixture',email:'fixture@example.test'} as never}/><button id="next-control">Après le compte</button></>:kind==='navigation'?<Navbar/>:<ContactPageClient/>
createRoot(document.getElementById('root')!).render(view)
