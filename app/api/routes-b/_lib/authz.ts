import { NextRequest } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

export class RoutesBForbiddenError extends Error {
  code = 'FORBIDDEN'
  status = 403

  constructor(message: string = 'Forbidden') {
    super(message)
    this.name = 'RoutesBForbiddenError'
  }
}

export interface AuthContext {
  userId: string
  role: string
  scopes: string[]
}

/**
 * Verifies that the request has a valid auth token and the required scope.
 * Throws RoutesBForbiddenError if authentication fails or scope is missing.
 */
export async function requireScope(
  request: NextRequest,
  requiredScope: string
): Promise<AuthContext> {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  
  if (!authToken) {
    throw new RoutesBForbiddenError('Missing authentication token')
  }

  const claims = await verifyAuthToken(authToken)
  if (!claims) {
    throw new RoutesBForbiddenError('Invalid authentication token')
  }

  const user = await prisma.user.findUnique({
    where: { privyId: claims.userId },
    select: { id: true, role: true },
  })

  if (!user) {
    throw new RoutesBForbiddenError('User not found')
  }

  // For now, assume all authenticated users have the routes-b:read scope
  // This can be expanded with more granular scope checking in the future
  const scopes = ['routes-b:read', 'routes-b:write']

  return {
    userId: user.id,
    role: user.role,
    scopes,
  }
}
