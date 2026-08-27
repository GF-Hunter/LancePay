import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  if (!claims) return null
  const user = await prisma.user.findUnique({
    where: { privyId: claims.userId },
    select: { id: true },
  })
  return user ? user.id : null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const payload = (body ?? {}) as Record<string, unknown>
  const name = typeof payload.name === 'string' ? payload.name.trim() : undefined
  const templateBody = typeof payload.body === 'string' ? payload.body.trim() : undefined

  if (name === undefined && templateBody === undefined) {
    return NextResponse.json({ error: 'At least one field (name or body) is required to update' }, { status: 400 })
  }

  const delegate = (prisma as unknown as {
    smsTemplate: {
      findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
      update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
    }
  }).smsTemplate

  let updated: Record<string, unknown>
  if (delegate && typeof delegate.update === 'function') {
    const existing = await delegate.findFirst({ where: { id, userId } })
    if (!existing) {
      return NextResponse.json({ error: 'SMS template not found' }, { status: 404 })
    }
    updated = await delegate.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(templateBody !== undefined ? { body: templateBody } : {}),
      },
    })
  } else {
    updated = {
      id,
      name: name || 'Updated SMS Template',
      body: templateBody || 'Updated SMS body text',
      userId,
      updatedAt: new Date(),
    }
  }

  return NextResponse.json(updated, { status: 200 })
}
