import AccountAccessBoundary from '@/components/AccountAccessBoundary'
import {privatePageMetadata} from '@/lib/seo'
import DeveloperNavigation from '@/components/DeveloperNavigation'
import styles from '@/components/developer/developer.module.css'
import {EmailNotice} from '@/components/developer/DeveloperUI'
export const metadata=privatePageMetadata
export default function Layout({children}:{children:React.ReactNode}){return <AccountAccessBoundary><div className={`${styles.shell} ${styles.layout}`}><DeveloperNavigation/><div className={styles.content}><div className={styles.page}><EmailNotice/>{children}</div></div></div></AccountAccessBoundary>}
