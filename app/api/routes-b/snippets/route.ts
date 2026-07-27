import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET  /api/routes-b/snippets — list the authenticated user's reusable text snippets
// POST /api/routes-b/snippets — create a new reusable text snippet

const MAX_TITLE_LENGTH = 150

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId } })
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const snippets = await prisma.snippet.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({ snippets })
  } catch (error) {
    logger.error({ err: error }, 'List snippets error')
    return NextResponse.json({ error: 'Failed to list snippets' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as {
      title?: string
      content?: string
    } | null
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { title, content } = body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    if (title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { error: `title must be at most ${MAX_TITLE_LENGTH} characters` },
        { status: 400 },
      )
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    const snippet = await prisma.snippet.create({
      data: {
        userId: user.id,
        title: title.trim(),
        content: content.trim(),
      },
    })

    return NextResponse.json({ snippet }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'Create snippet error')
    return NextResponse.json({ error: 'Failed to create snippet' }, { status: 500 })
  }
}
