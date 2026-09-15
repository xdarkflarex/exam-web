import type { Metadata } from 'next'
import { FunctionAnalysisClient } from '@/components/tools/clients'

export const metadata: Metadata = {
  title: 'Khảo sát hàm số',
}

export default function FunctionAnalysisPage() {
  return <FunctionAnalysisClient />
}
