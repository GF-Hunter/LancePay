import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const SESSION_DURATION_MINUTES = 30
const IMPERSONATION_REASON_MAX_LENGTH = 500

type AdminRoleDelegate = {
  findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

type UserDelegate = {
  findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

function getAdminRoleDelegate(): AdminRoleDelegate {
  return (prisma as unknown as { adminRole: AdminRoleDelegate }).adminRole
}

async function getAuthenticatedAdmin(request: NextRequest): Promise<{ adminId: string } | null> {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  if (!claims) return null

  const adminRole = await getAdminRoleDelegate().findFirst({
    where: { userId: claims.userId, active: true },
    select: { id: true },
  })

  if (!adminRole) return null

  const user = await prisma.user.findUnique({
    where: { privyId: claims.userId },
    select: { id: true },
  })

  return user ? { adminId: user.id } : null
}

export async function POST(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request)
  if (!admin) {
    return NextResponse.json(
      { error: 'Unauthorized — admin role required' },
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const payload = (body ?? {}) as Record<string, unknown>

  const targetUserId = typeof payload.targetUserId === 'string' ? payload.targetUserId.trim() : null
  if (!targetUserId) {
    return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 })
  }

  if (targetUserId === admin.adminId) {
    return NextResponse.json(
      { error: 'Cannot impersonate your own account' },
      { status: 400 },
    )
  }

  const rawReason = payload.reason
  const reason = typeof rawReason === 'string' ? rawReason.trim() : null
  if (!reason) {
    return NextResponse.json({ error: 'reason is required for audit purposes' }, { status: 400 })
  }
  if (reason.length > IMPERSONATION_REASON_MAX_LENGTH) {
    return NextResponse.json(
      { error: `reason must be at most ${IMPERSONATION_REASON_MAX_LENGTH} characters` },
      { status: 400 },
    )
  }

  const targetUserDelegate = (prisma as unknown as { user: UserDelegate }).user
  const targetUser = await targetUserDelegate.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true },
  })

  if (!targetUser) {
    return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
  }

  const sessionId = `imp_${admin.adminId.slice(0, 8)}_${Date.now()}`
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MINUTES * 60_000).toISOString()

  return NextResponse.json(
    {
      sessionId,
      adminId: admin.adminId,
      targetUserId: targetUser.id,
      targetUserEmail: targetUser.email,
      reason,
      expiresAt,
      durationMinutes: SESSION_DURATION_MINUTES,
    },
    { status: 201 },
  )
}
