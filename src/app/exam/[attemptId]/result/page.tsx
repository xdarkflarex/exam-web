import { redirect } from 'next/navigation'

export default async function LegacyExamResultPage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  const { attemptId } = await params
  redirect(`/result/${attemptId}`)
}
