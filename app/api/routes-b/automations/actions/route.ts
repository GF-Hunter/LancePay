import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'

// GET /api/routes-b/automations/actions — list available automation action types.

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

const ACTIONS = [
  { value: 'send_email', label: 'Send email', description: 'Sends an email notification.' },
  { value: 'send_notification', label: 'Send notification', description: 'Sends an in-app notification.' },
  { value: 'tag_client', label: 'Tag client', description: 'Applies a tag to the related client.' },
  { value: 'create_task', label: 'Create task', description: 'Creates a follow-up task.' },
]

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({ actions: ACTIONS })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/automations/actions error')
    return NextResponse.json({ error: 'Failed to fetch automation actions' }, { status: 500 })
  }
}
