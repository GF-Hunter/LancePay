-- CreateTable: InvoiceAttachment
CREATE TABLE "InvoiceAttachment" (
    "id"         TEXT NOT NULL,
    "invoiceId"  TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "fileName"   VARCHAR(255) NOT NULL,
    "fileUrl"    VARCHAR(512) NOT NULL,
    "mimeType"   VARCHAR(100) NOT NULL,
    "sizeBytes"  INTEGER NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceAttachment_invoiceId_idx" ON "InvoiceAttachment"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceAttachment_createdAt_idx" ON "InvoiceAttachment"("createdAt");

-- AddForeignKey
ALTER TABLE "InvoiceAttachment" ADD CONSTRAINT "InvoiceAttachment_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAttachment" ADD CONSTRAINT "InvoiceAttachment_uploadedBy_fkey"
    FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: CreditNote
CREATE TABLE "CreditNote" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "invoiceId"    TEXT NOT NULL,
    "creditNumber" TEXT NOT NULL,
    "amount"       DECIMAL(10,2) NOT NULL,
    "currency"     TEXT NOT NULL DEFAULT 'USD',
    "reason"       TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'issued',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_creditNumber_key" ON "CreditNote"("creditNumber");

-- CreateIndex
CREATE INDEX "CreditNote_userId_idx" ON "CreditNote"("userId");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditNote_status_idx" ON "CreditNote"("status");

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: PaymentPlan
CREATE TABLE "PaymentPlan" (
    "id"               TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "invoiceId"        TEXT NOT NULL,
    "totalAmount"      DECIMAL(10,2) NOT NULL,
    "currency"         TEXT NOT NULL DEFAULT 'USD',
    "installmentCount" INTEGER NOT NULL,
    "frequency"        TEXT NOT NULL DEFAULT 'monthly',
    "status"           TEXT NOT NULL DEFAULT 'active',
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentPlan_invoiceId_key" ON "PaymentPlan"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentPlan_userId_idx" ON "PaymentPlan"("userId");

-- CreateIndex
CREATE INDEX "PaymentPlan_status_idx" ON "PaymentPlan"("status");

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: PaymentPlanInstallment
CREATE TABLE "PaymentPlanInstallment" (
    "id"            TEXT NOT NULL,
    "paymentPlanId" TEXT NOT NULL,
    "sequence"      INTEGER NOT NULL,
    "amount"        DECIMAL(10,2) NOT NULL,
    "dueDate"       TIMESTAMP(3) NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'pending',
    "paidAt"        TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentPlanInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentPlanInstallment_paymentPlanId_sequence_key" ON "PaymentPlanInstallment"("paymentPlanId", "sequence");

-- CreateIndex
CREATE INDEX "PaymentPlanInstallment_paymentPlanId_idx" ON "PaymentPlanInstallment"("paymentPlanId");

-- CreateIndex
CREATE INDEX "PaymentPlanInstallment_dueDate_idx" ON "PaymentPlanInstallment"("dueDate");

-- AddForeignKey
ALTER TABLE "PaymentPlanInstallment" ADD CONSTRAINT "PaymentPlanInstallment_paymentPlanId_fkey"
    FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
