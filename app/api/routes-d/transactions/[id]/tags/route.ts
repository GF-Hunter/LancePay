import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-d/transactions/[id]/tags - list transaction tags
// POST /api/routes-d/transactions/[id]/tags - add transaction tags

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const claims = await verifyAuthToken(authToken)
    if (!claims) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id },
    })

    if (!transaction || transaction.userId !== user.id) {
      return NextResponse.json({ error: 'Transaction not found or unauthorized' }, { status: 404 })
    }

    return NextResponse.json({
      id: transaction.id,
      tags: [],
    })
  } catch (error) {
    logger.error({ err: error }, 'Get transaction tags error')
    return NextResponse.json({ error: 'Failed to fetch transaction tags' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const claims = await verifyAuthToken(authToken)
    if (!claims) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id },
    })

    if (!transaction || transaction.userId !== user.id) {
      return NextResponse.json({ error: 'Transaction not found or unauthorized' }, { status: 404 })
    }

    const body = (await request.json().catch(() => null)) as { tags?: string[] | string } | null
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const tagsInput = body.tags
    if (!tagsInput) {
      return NextResponse.json({ error: 'Tags are required' }, { status: 400 })
    }

    const tagsList = Array.isArray(tagsInput)
      ? tagsInput.map((t) => String(t).trim()).filter(Boolean)
      : [String(tagsInput).trim()].filter(Boolean)

    if (tagsList.length === 0) {
      return NextResponse.json({ error: 'Tags must be a non-empty array or string' }, { status: 400 })
    }

    return NextResponse.json(
      {
        message: 'Tags added successfully',
        transactionId: transaction.id,
        tags: tagsList,
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error({ err: error }, 'Add transaction tags error')
    return NextResponse.json({ error: 'Failed to add transaction tags' }, { status: 500 })
  }
}
