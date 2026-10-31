import AccountAccessBoundary from '@/components/AccountAccessBoundary'
import {privatePageMetadata} from '@/lib/seo'
export const metadata=privatePageMetadata
export default function Layout({children}:{children:React.ReactNode}){return <AccountAccessBoundary>{children}</AccountAccessBoundary>}
