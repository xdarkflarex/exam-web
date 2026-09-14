import type { Metadata } from 'next'
import { ConditionalProbabilityClient } from '@/components/tools/clients'

export const metadata: Metadata = {
  title: 'Xác suất có điều kiện · Công thức Bayes',
}

export default function ConditionalProbabilityPage() {
  return <ConditionalProbabilityClient />
}
