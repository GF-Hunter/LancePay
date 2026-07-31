-- CreateTable: RefundOverride
CREATE TABLE "RefundOverride" (
    "id"        TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "adminId"   TEXT NOT NULL,
    "amount"    DECIMAL(10,2) NOT NULL,
    "reason"    TEXT NOT NULL,
    "notes"     TEXT,
    "status"    TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefundOverride_invoiceId_idx" ON "RefundOverride"("invoiceId");

-- AddForeignKey
ALTER TABLE "RefundOverride" ADD CONSTRAINT "RefundOverride_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundOverride" ADD CONSTRAINT "RefundOverride_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
