import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'

const MAX_REDIRECT_URIS = 10

type OidcConfigDelegate = {
  findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

function getOidcConfigDelegate(): OidcConfigDelegate {
  const p = (globalThis as unknown as { prisma?: unknown }).prisma
  return (p as unknown as { oidcConfig: OidcConfigDelegate })?.oidcConfig
}

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  return claims ? claims.userId : null
}

function getMockConfig(orgId: string) {
  return {
    orgId,
    issuerUrl: 'https://accounts.google.com',
    clientId: 'oidc_client_placeholder',
    scopes: ['openid', 'email', 'profile'],
    redirectUris: [`https://app.lancepay.io/api/auth/oidc/callback?org=${orgId}`],
    enabled: true,
    updatedAt: '2025-05-01T00:00:00Z',
  }
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const orgId = searchParams.get('orgId') || userId

  const delegate = getOidcConfigDelegate()
  if (delegate) {
    const config = await delegate.findFirst({
      where: { orgId },
      select: { orgId: true, issuerUrl: true, clientId: true, scopes: true, redirectUris: true, enabled: true, updatedAt: true },
    })
    if (!config) {
      return NextResponse.json({ configured: false, config: null })
    }
    return NextResponse.json({ configured: true, config })
  }

  const config = getMockConfig(orgId)
  return NextResponse.json({ configured: true, config })
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

  const issuerUrl = typeof payload.issuerUrl === 'string' ? payload.issuerUrl.trim() : null
  if (!issuerUrl) {
    return NextResponse.json({ error: 'issuerUrl is required' }, { status: 400 })
  }
  if (!issuerUrl.startsWith('https://')) {
    return NextResponse.json({ error: 'issuerUrl must use HTTPS' }, { status: 400 })
  }

  const clientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : null
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
  }

  const clientSecret = typeof payload.clientSecret === 'string' ? payload.clientSecret.trim() : null
  if (!clientSecret) {
    return NextResponse.json({ error: 'clientSecret is required' }, { status: 400 })
  }

  const redirectUris = Array.isArray(payload.redirectUris)
    ? payload.redirectUris.filter((u): u is string => typeof u === 'string' && u.startsWith('https://'))
    : []
  if (redirectUris.length === 0) {
    return NextResponse.json({ error: 'At least one valid HTTPS redirectUri is required' }, { status: 400 })
  }
  if (redirectUris.length > MAX_REDIRECT_URIS) {
    return NextResponse.json({ error: `At most ${MAX_REDIRECT_URIS} redirectUris allowed` }, { status: 400 })
  }

  const orgId = typeof payload.orgId === 'string' ? payload.orgId.trim() : userId
  const scopes = Array.isArray(payload.scopes)
    ? payload.scopes.filter((s): s is string => typeof s === 'string')
    : ['openid', 'email', 'profile']

  const now = new Date().toISOString()

  const delegate = getOidcConfigDelegate()
  if (delegate) {
    const config = await delegate.upsert({
      where: { orgId },
      update: { issuerUrl, clientId, clientSecret, redirectUris, scopes, enabled: true, updatedAt: now },
      create: { orgId, issuerUrl, clientId, clientSecret, redirectUris, scopes, enabled: true },
    })
    return NextResponse.json({ configured: true, config }, { status: 201 })
  }

  return NextResponse.json(
    { configured: true, config: { orgId, issuerUrl, clientId, scopes, redirectUris, enabled: true, updatedAt: now } },
    { status: 201 },
  )
}
