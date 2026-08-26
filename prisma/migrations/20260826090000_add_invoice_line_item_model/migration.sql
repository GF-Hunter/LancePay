-- CreateTable: InvoiceLineItem
CREATE TABLE "InvoiceLineItem" (
    "id"          TEXT NOT NULL,
    "invoiceId"   TEXT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity"    DECIMAL(10,2) NOT NULL,
    "unitPrice"   DECIMAL(10,2) NOT NULL,
    "position"    INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_position_idx" ON "InvoiceLineItem"("invoiceId", "position");

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
