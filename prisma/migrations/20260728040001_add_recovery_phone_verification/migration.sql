-- AlterTable: add recovery phone fields to User
ALTER TABLE "User" ADD COLUMN "recoveryPhone" TEXT;
ALTER TABLE "User" ADD COLUMN "recoveryPhoneVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: RecoveryPhoneVerification
CREATE TABLE "RecoveryPhoneVerification" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "phone"     VARCHAR(20) NOT NULL,
    "code"      VARCHAR(10) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryPhoneVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecoveryPhoneVerification_userId_idx" ON "RecoveryPhoneVerification"("userId");

-- AddForeignKey
ALTER TABLE "RecoveryPhoneVerification" ADD CONSTRAINT "RecoveryPhoneVerification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
