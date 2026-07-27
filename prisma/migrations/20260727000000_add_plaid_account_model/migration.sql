-- CreateTable
CREATE TABLE "PlaidAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plaidItemId" VARCHAR(255) NOT NULL,
    "plaidAccountId" VARCHAR(255) NOT NULL,
    "institutionName" VARCHAR(255) NOT NULL,
    "accountName" VARCHAR(255) NOT NULL,
    "mask" VARCHAR(4),
    "type" VARCHAR(50) NOT NULL,
    "subtype" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaidAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaidAccount_plaidAccountId_key" ON "PlaidAccount"("plaidAccountId");
CREATE INDEX "PlaidAccount_userId_idx" ON "PlaidAccount"("userId");
CREATE INDEX "PlaidAccount_status_idx" ON "PlaidAccount"("status");

-- AddForeignKey
ALTER TABLE "PlaidAccount" ADD CONSTRAINT "PlaidAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
