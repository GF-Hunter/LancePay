import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const findUnique = vi.fn()
const entryFindFirst = vi.fn()
const entryCount = vi.fn()
const entryDelete = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique },
    ipAllowlistEntry: {
      findFirst: entryFindFirst,
      count: entryCount,
      delete: entryDelete,
    },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/ip-allowlist/entry_1'

function makeRequest(withAuth = true) {
  return new NextRequest(BASE_URL, {
    method: 'DELETE',
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  })
}

function makeParams(id: string) {
  return { params: { id } }
}

const ENTRY = {
  id: 'entry_1',
  userId: 'user_1',
  cidr: '203.0.113.0/24',
  label: 'Office',
}

function authOk() {
  verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
  findUnique.mockResolvedValue({ id: 'user_1' })
}

describe('DELETE /api/routes-d/ip-allowlist/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no authorization header is present', async () => {
    const { DELETE } = await import('@/app/api/routes-d/ip-allowlist/[id]/route')
    const res = await DELETE(makeRequest(false), makeParams('entry_1'))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { DELETE } = await import('@/app/api/routes-d/ip-allowlist/[id]/route')
    const res = await DELETE(makeRequest(), makeParams('entry_1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for a blank id', async () => {
    authOk()
    const { DELETE } = await import('@/app/api/routes-d/ip-allowlist/[id]/route')
    const res = await DELETE(makeRequest(), makeParams('  '))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the entry does not exist or belongs to another user', async () => {
    authOk()
    entryFindFirst.mockResolvedValue(null)
    const { DELETE } = await import('@/app/api/routes-d/ip-allowlist/[id]/route')
    const res = await DELETE(makeRequest(), makeParams('entry_1'))
    expect(res.status).toBe(404)
    expect(entryFindFirst).toHaveBeenCalledWith({
      where: { id: 'entry_1', userId: 'user_1' },
    })
    expect(entryDelete).not.toHaveBeenCalled()
  })

  it('deletes an owned entry and returns what was removed', async () => {
    authOk()
    entryFindFirst.mockResolvedValue(ENTRY)
    entryCount.mockResolvedValue(2)
    entryDelete.mockResolvedValue(ENTRY)
    const { DELETE } = await import('@/app/api/routes-d/ip-allowlist/[id]/route')
    const res = await DELETE(makeRequest(), makeParams('entry_1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.removed).toEqual({ id: 'entry_1', cidr: '203.0.113.0/24', label: 'Office' })
    expect(json.remainingEntries).toBe(2)
    expect(json.warning).toBeNull()
    expect(entryDelete).toHaveBeenCalledWith({ where: { id: 'entry_1' } })
  })

  it('warns when the last entry is removed', async () => {
    authOk()
    entryFindFirst.mockResolvedValue(ENTRY)
    entryCount.mockResolvedValue(0)
    entryDelete.mockResolvedValue(ENTRY)
    const { DELETE } = await import('@/app/api/routes-d/ip-allowlist/[id]/route')
    const json = await (await DELETE(makeRequest(), makeParams('entry_1'))).json()
    expect(json.remainingEntries).toBe(0)
    expect(json.warning).toMatch(/no longer IP-restricted/)
  })

  it('returns 500 when the delete fails', async () => {
    authOk()
    entryFindFirst.mockResolvedValue(ENTRY)
    entryCount.mockResolvedValue(1)
    entryDelete.mockRejectedValue(new Error('db down'))
    const { DELETE } = await import('@/app/api/routes-d/ip-allowlist/[id]/route')
    const res = await DELETE(makeRequest(), makeParams('entry_1'))
    expect(res.status).toBe(500)
  })
})
