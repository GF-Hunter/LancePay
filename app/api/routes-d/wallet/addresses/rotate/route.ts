import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { randomBytes } from 'crypto'

// Stellar public keys are 56 chars: 'G' + 55 base32 chars. This generates a
// well-formed placeholder address; real key generation happens in the wallet
// infrastructure, not this API.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function generateStellarStyleAddress(): string {
  const bytes = randomBytes(55)
  let out = 'G'
  for (let i = 0; i < 55; i++) {
    out += BASE32_ALPHABET[bytes[i] % BASE32_ALPHABET.length]
  }
  return out
}

function maskAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

export async function POST(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: { id: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } })
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    const newAddress = generateStellarStyleAddress()
    const updated = await prisma.wallet.update({
      where: { id: wallet.id },
      data: { address: newAddress },
    })

    return NextResponse.json({
      success: true,
      address: updated.address,
      previous_address: maskAddress(wallet.address),
      rotated_at: new Date().toISOString(),
    })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/wallet/addresses/rotate error')
    return NextResponse.json({ error: 'Failed to rotate wallet address' }, { status: 500 })
  }
}
