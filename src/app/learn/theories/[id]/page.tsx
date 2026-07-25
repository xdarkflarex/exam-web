import { redirect } from 'next/navigation'

export default async function LegacyTheoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/learn?theory=${id}`)
}
