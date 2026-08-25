import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const MAX_TITLE_LENGTH = 200
const MAX_BODY_LENGTH = 5000
const DEFAULT_PAGE_SIZE = 20

type InAppAnnouncementDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>
  count: (args: Record<string, unknown>) => Promise<number>
  create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

function getInAppAnnouncementDelegate(): InAppAnnouncementDelegate {
  return (prisma as unknown as { inAppAnnouncement: InAppAnnouncementDelegate }).inAppAnnouncement
}

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
  const rawLimit = searchParams.get('limit')
  const limit = Math.min(
    rawLimit ? parseInt(rawLimit, 10) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE,
    100,
  )
  const cursor = searchParams.get('cursor') || undefined

  const delegate = getInAppAnnouncementDelegate()
  const [announcements, total] = await Promise.all([
    delegate.findMany({
      where: cursor ? { id: { lt: cursor } } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        body: true,
        authorId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    delegate.count({}),
  ])

  const nextCursor =
    announcements.length === limit
      ? (announcements[announcements.length - 1] as { id: string }).id
      : null

  return NextResponse.json({ announcements, total, nextCursor })
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

  const title = typeof payload.title === 'string' ? payload.title.trim() : null
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json(
      { error: `title must be at most ${MAX_TITLE_LENGTH} characters` },
      { status: 400 },
    )
  }

  const announcementBody = typeof payload.body === 'string' ? payload.body.trim() : null
  if (!announcementBody) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 })
  }
  if (announcementBody.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `body must be at most ${MAX_BODY_LENGTH} characters` },
      { status: 400 },
    )
  }

  const delegate = getInAppAnnouncementDelegate()
  const created = await delegate.create({
    data: {
      title,
      body: announcementBody,
      authorId: userId,
    },
    select: {
      id: true,
      title: true,
      body: true,
      authorId: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json(created, { status: 201 })
}
