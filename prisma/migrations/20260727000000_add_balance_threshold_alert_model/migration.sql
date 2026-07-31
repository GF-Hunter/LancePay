-- CreateTable: BalanceThresholdAlert
CREATE TABLE "BalanceThresholdAlert" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "currency"        VARCHAR(8) NOT NULL DEFAULT 'USD',
    "direction"       VARCHAR(10) NOT NULL,
    "threshold"       DECIMAL(18,2) NOT NULL,
    "enabled"         BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalanceThresholdAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BalanceThresholdAlert_userId_idx" ON "BalanceThresholdAlert"("userId");

-- AddForeignKey
ALTER TABLE "BalanceThresholdAlert" ADD CONSTRAINT "BalanceThresholdAlert_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
