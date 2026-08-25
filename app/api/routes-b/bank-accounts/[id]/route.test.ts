import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'
import * as authLib from '@/lib/auth'
import * as db from '@/lib/db'
import * as loggerLib from '@/lib/logger'

vi.mock('@/lib/auth')
vi.mock('@/lib/db')
vi.mock('@/lib/logger')

describe('GET /api/routes-b/bank-accounts/[id]', () => {
  const mockUserId = 'user-123'
  const mockPrivyId = 'privy-123'
  const mockBankAccountId = 'bank-acc-123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 when no auth token provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts/bank-acc-123')
    const response = await GET(request, { params: { id: mockBankAccountId } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 401 when token verification fails', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts/bank-acc-123', {
      headers: { Authorization: 'Bearer invalid-token' },
    })
    const response = await GET(request, { params: { id: mockBankAccountId } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 401 when user not found', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts/bank-acc-123', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request, { params: { id: mockBankAccountId } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 404 when bank account not found', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.bankAccount.findFirst).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts/bank-acc-123', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request, { params: { id: mockBankAccountId } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Bank account not found')
  })

  it('should return 404 when bank account belongs to different user', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.bankAccount.findFirst).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts/bank-acc-123', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request, { params: { id: mockBankAccountId } })

    const findFirstCall = vi.mocked(db.prisma.bankAccount.findFirst).mock.calls[0][0]
    expect(findFirstCall.where).toEqual({
      id: mockBankAccountId,
      userId: mockUserId,
    })
  })

  it('should return bank account details for authenticated user', async () => {
    const mockBankAccount = {
      id: mockBankAccountId,
      bankName: 'Chase Bank',
      bankCode: 'CHASUS33',
      accountNumber: '****1234',
      accountName: 'John Doe',
      isVerified: true,
      isDefault: true,
      nickname: 'Main Account',
      createdAt: new Date(),
    }

    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.bankAccount.findFirst).mockResolvedValue(mockBankAccount)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts/bank-acc-123', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request, { params: { id: mockBankAccountId } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.bankAccount).toEqual(mockBankAccount)
    expect(data.bankAccount.bankName).toBe('Chase Bank')
    expect(data.bankAccount.isVerified).toBe(true)
    expect(data.bankAccount.isDefault).toBe(true)
  })

  it('should exclude sensitive data from response', async () => {
    const mockBankAccount = {
      id: mockBankAccountId,
      bankName: 'Chase Bank',
      bankCode: 'CHASUS33',
      accountNumber: '****1234',
      accountName: 'John Doe',
      isVerified: true,
      isDefault: false,
      nickname: null,
      createdAt: new Date(),
    }

    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.bankAccount.findFirst).mockResolvedValue(mockBankAccount)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts/bank-acc-123', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request, { params: { id: mockBankAccountId } })
    const data = await response.json()

    expect(data.bankAccount).not.toHaveProperty('userId')
    expect(response.status).toBe(200)
  })

  it('should return 500 on database error', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.bankAccount.findFirst).mockRejectedValue(
      new Error('Database connection failed')
    )

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts/bank-acc-123', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request, { params: { id: mockBankAccountId } })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to fetch bank account')
  })
})
