import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const findUnique = vi.fn()
const groupFindMany = vi.fn()
const groupFindFirst = vi.fn()
const groupCreate = vi.fn()
const groupCount = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique },
    scimGroup: {
      findMany: groupFindMany,
      findFirst: groupFindFirst,
      create: groupCreate,
      count: groupCount,
    },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/scim/v2/Groups'
const GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group'
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'

function makeGet(url = BASE_URL, withAuth = true) {
  return new NextRequest(url, {
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  })
}

function makePost(body: unknown, withAuth = true) {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: {
      ...(withAuth ? { authorization: 'Bearer token' } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const storedGroup = {
  id: 'grp_1',
  userId: 'user_1',
  displayName: 'Engineering',
  members: [{ value: 'user_2', display: 'Dev One' }],
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-02T00:00:00Z'),
}

function authOk() {
  verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
  findUnique.mockResolvedValue({ id: 'user_1' })
}

describe('GET /api/routes-d/scim/v2/Groups', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no authorization header is present', async () => {
    const { GET } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await GET(makeGet(BASE_URL, false))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    findUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await GET(makeGet())
    expect(res.status).toBe(404)
  })

  it('returns a SCIM ListResponse envelope', async () => {
    authOk()
    groupFindMany.mockResolvedValue([storedGroup])
    groupCount.mockResolvedValue(1)
    const { GET } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.schemas).toEqual([LIST_SCHEMA])
    expect(json.totalResults).toBe(1)
    expect(json.startIndex).toBe(1)
    expect(json.itemsPerPage).toBe(1)
    expect(json.Resources[0]).toMatchObject({
      schemas: [GROUP_SCHEMA],
      id: 'grp_1',
      displayName: 'Engineering',
      members: [{ value: 'user_2', display: 'Dev One' }],
      meta: expect.objectContaining({ resourceType: 'Group' }),
    })
  })

  it('applies SCIM 1-based pagination parameters', async () => {
    authOk()
    groupFindMany.mockResolvedValue([])
    groupCount.mockResolvedValue(30)
    const { GET } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    await GET(makeGet(`${BASE_URL}?startIndex=11&count=5`))
    expect(groupFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    )
  })

  it('supports the displayName eq filter', async () => {
    authOk()
    groupFindMany.mockResolvedValue([storedGroup])
    groupCount.mockResolvedValue(1)
    const { GET } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const filter = encodeURIComponent('displayName eq "Engineering"')
    await GET(makeGet(`${BASE_URL}?filter=${filter}`))
    expect(groupFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1', displayName: 'Engineering' },
      }),
    )
  })

  it('returns 400 for an unsupported filter', async () => {
    authOk()
    const { GET } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const filter = encodeURIComponent('members co "user_2"')
    const res = await GET(makeGet(`${BASE_URL}?filter=${filter}`))
    expect(res.status).toBe(400)
  })

  it('returns 500 when the database query fails', async () => {
    authOk()
    groupFindMany.mockRejectedValue(new Error('db down'))
    groupCount.mockResolvedValue(0)
    const { GET } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await GET(makeGet())
    expect(res.status).toBe(500)
  })
})

describe('POST /api/routes-d/scim/v2/Groups', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no authorization header is present', async () => {
    const { POST } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await POST(makePost({ displayName: 'Engineering' }, false))
    expect(res.status).toBe(401)
  })

  it('returns 400 when displayName is missing', async () => {
    authOk()
    const { POST } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await POST(makePost({ schemas: [GROUP_SCHEMA] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when schemas is present but wrong', async () => {
    authOk()
    const { POST } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await POST(
      makePost({ schemas: ['urn:wrong'], displayName: 'Engineering' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when a member has no value', async () => {
    authOk()
    const { POST } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await POST(
      makePost({ displayName: 'Engineering', members: [{ display: 'No Value' }] }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 409 when a group with the displayName already exists', async () => {
    authOk()
    groupFindFirst.mockResolvedValue(storedGroup)
    const { POST } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await POST(makePost({ displayName: 'Engineering' }))
    expect(res.status).toBe(409)
  })

  it('creates the group and returns a SCIM Group resource with 201', async () => {
    authOk()
    groupFindFirst.mockResolvedValue(null)
    groupCreate.mockResolvedValue(storedGroup)
    const { POST } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await POST(
      makePost({
        schemas: [GROUP_SCHEMA],
        displayName: 'Engineering',
        members: [{ value: 'user_2', display: 'Dev One' }],
      }),
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.schemas).toEqual([GROUP_SCHEMA])
    expect(json.id).toBe('grp_1')
    expect(json.displayName).toBe('Engineering')
    expect(groupCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        displayName: 'Engineering',
        members: [{ value: 'user_2', display: 'Dev One' }],
      },
    })
  })

  it('trims displayName and defaults members to an empty array', async () => {
    authOk()
    groupFindFirst.mockResolvedValue(null)
    groupCreate.mockResolvedValue({ ...storedGroup, displayName: 'Design', members: [] })
    const { POST } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await POST(makePost({ displayName: '  Design  ' }))
    expect(res.status).toBe(201)
    expect(groupCreate).toHaveBeenCalledWith({
      data: { userId: 'user_1', displayName: 'Design', members: [] },
    })
  })

  it('returns 500 when the create fails', async () => {
    authOk()
    groupFindFirst.mockResolvedValue(null)
    groupCreate.mockRejectedValue(new Error('db down'))
    const { POST } = await import('@/app/api/routes-d/scim/v2/Groups/route')
    const res = await POST(makePost({ displayName: 'Engineering' }))
    expect(res.status).toBe(500)
  })
})
