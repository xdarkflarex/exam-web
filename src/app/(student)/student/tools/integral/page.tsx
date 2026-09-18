import type { Metadata } from 'next'
import { IntegralClient } from '@/components/tools/clients'

export const metadata: Metadata = {
  title: 'Tích phân',
}

export default function IntegralPage() {
  return <IntegralClient />
}
