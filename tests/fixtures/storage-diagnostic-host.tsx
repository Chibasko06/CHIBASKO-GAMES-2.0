import {createRoot} from 'react-dom/client'
import StorageDiagnostic from '../../components/game-runtime/StorageDiagnostic'

createRoot(document.getElementById('root')!).render(<StorageDiagnostic origin="https://diagnostics.chibaskogames-play.fr"/>)
