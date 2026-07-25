-- CreateTable
CREATE TABLE "BankFeedSync" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'idle',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankFeedSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankFeedSync_bankAccountId_key" ON "BankFeedSync"("bankAccountId");
CREATE INDEX "BankFeedSync_userId_idx" ON "BankFeedSync"("userId");
CREATE INDEX "BankFeedSync_status_idx" ON "BankFeedSync"("status");

-- AddForeignKey
ALTER TABLE "BankFeedSync" ADD CONSTRAINT "BankFeedSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankFeedSync" ADD CONSTRAINT "BankFeedSync_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
