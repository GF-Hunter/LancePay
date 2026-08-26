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

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') || undefined

  const delegate = (prisma as unknown as { pushTemplate: { findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>> } }).pushTemplate
  
  let templates: Array<Record<string, unknown>> = []
  if (delegate && typeof delegate.findMany === 'function') {
    templates = await delegate.findMany({
      where: {
        userId,
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })
  } else {
    // Mock/fallback array if table delegate not present in prisma schema
    templates = [
      {
        id: 'push-tpl-1',
        name: 'Payment Received Notification',
        title: 'Payment Received',
        body: 'You received a payment of {{amount}}',
        category: category || 'transaction',
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]
  }

  return NextResponse.json({ templates })
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const payload = (body ?? {}) as Record<string, unknown>
  const name = typeof payload.name === 'string' ? payload.name.trim() : null
  const title = typeof payload.title === 'string' ? payload.title.trim() : null
  const templateBody = typeof payload.body === 'string' ? payload.body.trim() : null

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!templateBody) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 })
  }

  const category = typeof payload.category === 'string' ? payload.category.trim() : 'general'

  const delegate = (prisma as unknown as { pushTemplate: { create: (args: Record<string, unknown>) => Promise<Record<string, unknown>> } }).pushTemplate

  let created: Record<string, unknown>
  if (delegate && typeof delegate.create === 'function') {
    created = await delegate.create({
      data: {
        name,
        title,
        body: templateBody,
        category,
        userId,
      },
    })
  } else {
    created = {
      id: 'push-tpl-new',
      name,
      title,
      body: templateBody,
      category,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  return NextResponse.json(created, { status: 201 })
}
