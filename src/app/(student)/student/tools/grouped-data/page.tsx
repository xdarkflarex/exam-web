import type { Metadata } from 'next'
import { GroupedDataClient } from '@/components/tools/clients'

export const metadata: Metadata = {
  title: 'Mẫu số liệu ghép nhóm',
}

export default function GroupedDataPage() {
  return <GroupedDataClient />
}
