import {createRoot} from 'react-dom/client'
import Dashboard from '../../app/dashboard/page'
import PlayersPage from '../../app/players/page'
import ProfileCard from '../../components/ProfileCard'
import DirectoryError from '../../app/players/error'
import DirectoryLoading from '../../app/players/loading'
import {Navbar} from '../../components/Navbar'

async function render() {
  const query = new URLSearchParams(location.search)
  const kind = location.pathname === '/players' ? 'directory' : query.get('kind')
  const root = createRoot(document.getElementById('root')!)
  let content
  if (kind === 'directory') {
    try {
      content = await PlayersPage({searchParams: Promise.resolve(Object.fromEntries(query))})
    } catch {
      content = <DirectoryError reset={() => location.reload()} />
    }
  } else if (kind === 'loading') {
    content = <DirectoryLoading />
  } else if (kind === 'profile') {
    content = <ProfileCard heading="h1" profile={{username:'Camille',bio:'Création de jeux et découverte.',roles:{admin:query.has('admin'),developer:query.has('developer')}}} />
  } else {
    content = <Dashboard />
  }
  root.render(<><Navbar /><main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{content}</main></>)
}

void render()
