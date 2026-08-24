import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'
import * as authLib from '@/lib/auth'
import * as db from '@/lib/db'
import * as loggerLib from '@/lib/logger'

vi.mock('@/lib/auth')
vi.mock('@/lib/db')
vi.mock('@/lib/logger')

describe('GET /api/routes-b/bank-accounts', () => {
  const mockUserId = 'user-123'
  const mockPrivyId = 'privy-123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 when no auth token provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 401 when token verification fails', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts', {
      headers: { Authorization: 'Bearer invalid-token' },
    })
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return bank accounts list for authenticated user', async () => {
    const mockBankAccounts = [
      {
        id: 'bank-1',
        bankName: 'Chase Bank',
        bankCode: 'CHASUS33',
        accountNumber: '****1234',
        accountName: 'John Doe',
        isVerified: true,
        isDefault: true,
        nickname: 'Main Account',
        createdAt: new Date(),
      },
      {
        id: 'bank-2',
        bankName: 'Bank of America',
        bankCode: 'BOFAUS3N',
        accountNumber: '****5678',
        accountName: 'John Doe',
        isVerified: false,
        isDefault: false,
        nickname: null,
        createdAt: new Date(),
      },
    ]

    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.bankAccount.findMany).mockResolvedValue(mockBankAccounts)
    vi.mocked(db.prisma.bankAccount.count).mockResolvedValue(2)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.bankAccounts).toHaveLength(2)
    expect(data.total).toBe(2)
    expect(data.page).toBe(1)
    expect(data.limit).toBe(20)
  })

  it('should support pagination', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.bankAccount.findMany).mockResolvedValue([])
    vi.mocked(db.prisma.bankAccount.count).mockResolvedValue(50)

    const request = new NextRequest(
      'http://localhost:3000/api/routes-b/bank-accounts?page=2&limit=10',
      { headers: { Authorization: 'Bearer valid-token' } }
    )
    const response = await GET(request)
    const data = await response.json()

    expect(data.page).toBe(2)
    expect(data.limit).toBe(10)

    const findManyCall = vi.mocked(db.prisma.bankAccount.findMany).mock.calls[0][0]
    expect(findManyCall.skip).toBe(10)
    expect(findManyCall.take).toBe(10)
  })

  it('should cap limit at 100', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.bankAccount.findMany).mockResolvedValue([])
    vi.mocked(db.prisma.bankAccount.count).mockResolvedValue(0)

    const request = new NextRequest(
      'http://localhost:3000/api/routes-b/bank-accounts?limit=500',
      { headers: { Authorization: 'Bearer valid-token' } }
    )
    const response = await GET(request)
    const data = await response.json()

    expect(data.limit).toBe(100)
  })

  it('should return 500 on database error', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.bankAccount.findMany).mockRejectedValue(
      new Error('Database connection failed')
    )

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to fetch bank accounts')
  })
})

describe('POST /api/routes-b/bank-accounts', () => {
  const mockUserId = 'user-123'
  const mockPrivyId = 'privy-123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 when no auth token provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts', {
      method: 'POST',
      body: JSON.stringify({
        bankName: 'Chase Bank',
        bankCode: 'CHASUS33',
        accountNumber: '1234567890',
        accountName: 'John Doe',
      }),
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 400 for invalid JSON', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts', {
      method: 'POST',
      body: 'invalid json',
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid JSON body')
  })

  it('should return 400 when required fields are missing', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts', {
      method: 'POST',
      body: JSON.stringify({ bankName: 'Chase Bank' }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('bankCode is required')
  })

  it('should return 400 when nickname exceeds max length', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts', {
      method: 'POST',
      body: JSON.stringify({
        bankName: 'Chase Bank',
        bankCode: 'CHASUS33',
        accountNumber: '1234567890',
        accountName: 'John Doe',
        nickname: 'a'.repeat(50),
      }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('nickname must be at most 32 characters')
  })

  it('should create bank account with valid data', async () => {
    const mockBankAccount = {
      id: 'bank-123',
      bankName: 'Chase Bank',
      bankCode: 'CHASUS33',
      accountNumber: '1234567890',
      accountName: 'John Doe',
      isVerified: false,
      isDefault: false,
      nickname: 'Main Account',
      createdAt: new Date(),
    }

    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.bankAccount.create).mockResolvedValue(mockBankAccount)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts', {
      method: 'POST',
      body: JSON.stringify({
        bankName: 'Chase Bank',
        bankCode: 'CHASUS33',
        accountNumber: '1234567890',
        accountName: 'John Doe',
        nickname: 'Main Account',
      }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.bankAccount).toEqual(mockBankAccount)
    expect(data.bankAccount.bankName).toBe('Chase Bank')
  })

  it('should set isDefault and isVerified flags', async () => {
    const mockBankAccount = {
      id: 'bank-123',
      bankName: 'Chase Bank',
      bankCode: 'CHASUS33',
      accountNumber: '1234567890',
      accountName: 'John Doe',
      isVerified: true,
      isDefault: true,
      nickname: null,
      createdAt: new Date(),
    }

    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.bankAccount.create).mockResolvedValue(mockBankAccount)

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts', {
      method: 'POST',
      body: JSON.stringify({
        bankName: 'Chase Bank',
        bankCode: 'CHASUS33',
        accountNumber: '1234567890',
        accountName: 'John Doe',
        isVerified: true,
        isDefault: true,
      }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.bankAccount.isVerified).toBe(true)
    expect(data.bankAccount.isDefault).toBe(true)
  })

  it('should return 500 on database error', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.bankAccount.create).mockRejectedValue(
      new Error('Database connection failed')
    )

    const request = new NextRequest('http://localhost:3000/api/routes-b/bank-accounts', {
      method: 'POST',
      body: JSON.stringify({
        bankName: 'Chase Bank',
        bankCode: 'CHASUS33',
        accountNumber: '1234567890',
        accountName: 'John Doe',
      }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to create bank account')
  })
})
