import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'

const SCIM_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User'
const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'

type ScimUser = {
  schemas: string[]
  id: string
  userName: string
  name: { formatted: string; givenName: string; familyName: string }
  emails: Array<{ value: string; primary: boolean }>
  active: boolean
  meta: { resourceType: string; created: string; lastModified: string; location: string }
}

function buildScimUser(u: {
  id: string
  email: string
  givenName: string
  familyName: string
  active: boolean
  createdAt: string
}): ScimUser {
  return {
    schemas: [SCIM_SCHEMA],
    id: u.id,
    userName: u.email,
    name: {
      formatted: `${u.givenName} ${u.familyName}`,
      givenName: u.givenName,
      familyName: u.familyName,
    },
    emails: [{ value: u.email, primary: true }],
    active: u.active,
    meta: {
      resourceType: 'User',
      created: u.createdAt,
      lastModified: u.createdAt,
      location: `/api/routes-d/scim/v2/Users/${u.id}`,
    },
  }
}

const SEED_USERS = [
  { id: 'scim-u1', email: 'alice@example.com', givenName: 'Alice', familyName: 'Smith', active: true, createdAt: '2025-01-10T00:00:00Z' },
  { id: 'scim-u2', email: 'bob@example.com', givenName: 'Bob', familyName: 'Jones', active: true, createdAt: '2025-02-01T00:00:00Z' },
  { id: 'scim-u3', email: 'carol@example.com', givenName: 'Carol', familyName: 'White', active: false, createdAt: '2025-03-15T00:00:00Z' },
]

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  return claims ? claims.userId : null
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const startIndex = Math.max(1, parseInt(searchParams.get('startIndex') ?? '1', 10))
  const count = Math.min(100, Math.max(1, parseInt(searchParams.get('count') ?? '100', 10)))
  const filterParam = searchParams.get('filter')

  let users = SEED_USERS
  if (filterParam) {
    const emailMatch = filterParam.match(/userName eq "([^"]+)"/i)
    if (emailMatch) {
      users = users.filter((u) => u.email.toLowerCase() === emailMatch[1].toLowerCase())
    }
  }

  const sliced = users.slice(startIndex - 1, startIndex - 1 + count)

  return NextResponse.json({
    schemas: [SCIM_LIST_SCHEMA],
    totalResults: users.length,
    startIndex,
    itemsPerPage: count,
    Resources: sliced.map(buildScimUser),
  })
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

  const userName = typeof payload.userName === 'string' ? payload.userName.trim() : null
  if (!userName) {
    return NextResponse.json({ error: 'userName (email) is required' }, { status: 400 })
  }

  const nameObj = (payload.name ?? {}) as Record<string, unknown>
  const givenName = typeof nameObj.givenName === 'string' ? nameObj.givenName.trim() : ''
  const familyName = typeof nameObj.familyName === 'string' ? nameObj.familyName.trim() : ''

  const newUser = {
    id: `scim-${Date.now()}`,
    email: userName,
    givenName,
    familyName,
    active: payload.active !== false,
    createdAt: new Date().toISOString(),
  }

  return NextResponse.json(buildScimUser(newUser), { status: 201 })
}
