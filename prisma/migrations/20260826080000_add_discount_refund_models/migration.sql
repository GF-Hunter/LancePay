-- CreateTable: Discount
CREATE TABLE "Discount" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "code"           TEXT NOT NULL,
    "type"           TEXT NOT NULL DEFAULT 'percent',
    "value"          DECIMAL(10,2) NOT NULL,
    "active"         BOOLEAN NOT NULL DEFAULT true,
    "maxRedemptions" INTEGER,
    "redemptions"    INTEGER NOT NULL DEFAULT 0,
    "expiresAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Discount_userId_code_key" ON "Discount"("userId", "code");

-- CreateIndex
CREATE INDEX "Discount_userId_idx" ON "Discount"("userId");

-- CreateIndex
CREATE INDEX "Discount_active_idx" ON "Discount"("active");

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: Refund
CREATE TABLE "Refund" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount"    DECIMAL(10,2) NOT NULL,
    "currency"  TEXT NOT NULL DEFAULT 'USD',
    "reason"    TEXT NOT NULL,
    "status"    TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Refund_userId_idx" ON "Refund"("userId");

-- CreateIndex
CREATE INDEX "Refund_invoiceId_idx" ON "Refund"("invoiceId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
