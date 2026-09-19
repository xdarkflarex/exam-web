import type { Metadata } from 'next'
import { SpaceClient } from '@/components/tools/clients'

export const metadata: Metadata = {
  title: 'Hình toạ độ Oxyz',
}

export default function SpacePage() {
  return <SpaceClient />
}
