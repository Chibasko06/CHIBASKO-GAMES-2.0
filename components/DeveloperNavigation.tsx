'use client'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {DevIcon} from './developer/DeveloperUI'
import styles from './developer/developer.module.css'
export default function DeveloperNavigation(){const path=usePathname();return <aside className={styles.sidebar}><p className={styles.brand}>Espace développeur</p><nav aria-label="Espace développeur" className={styles.nav}>{[['/developer','Vue d’ensemble','grid'],['/developer/games','Mes jeux','game'],['/developer/submissions','Mes soumissions','send'],['/developer/statistics','Statistiques','chart'],['/developer/profile','Mon profil développeur','mail'],['/developer/resources','Ressources','book']].map(([url,label,icon])=><Link aria-current={(url==='/developer'?path===url:path.startsWith(url)||url==='/developer/submissions'&&path.startsWith('/developer/builds/'))?'page':undefined} href={url} key={url}><DevIcon name={icon}/>{label}</Link>)}</nav><div className={styles.sidebarNote}>Une question sur votre jeu ?<a href="mailto:developers@chibaskogames.fr">Contacter l’équipe développeurs ↗</a></div></aside>}
