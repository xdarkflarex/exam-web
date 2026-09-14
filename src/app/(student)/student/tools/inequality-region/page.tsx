import type { Metadata } from 'next'
import { InequalityRegionClient } from '@/components/tools/clients'

export const metadata: Metadata = {
  title: 'Vẽ miền nghiệm hệ bất phương trình',
}

export default function InequalityRegionPage() {
  return <InequalityRegionClient />
}
