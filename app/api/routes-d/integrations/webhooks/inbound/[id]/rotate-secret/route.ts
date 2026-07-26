import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import crypto from 'crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { id } = await params
  const webhook = await prisma.userWebhook.findUnique({ where: { id } })
  if (!webhook) return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })

  if (webhook.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const signingSecret = crypto.randomBytes(32).toString('hex')
  await prisma.userWebhook.update({
    where: { id },
    data: { signingSecret },
  })

  return NextResponse.json({ signingSecret }, { status: 200 })
}
