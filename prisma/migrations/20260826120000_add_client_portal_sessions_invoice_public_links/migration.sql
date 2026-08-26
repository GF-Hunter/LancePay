-- CreateTable: ClientPortalSession
CREATE TABLE "ClientPortalSession" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "clientId"    TEXT NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "tokenHint"   VARCHAR(12) NOT NULL,
    "lastSeenAt"  TIMESTAMP(3),
    "revokedAt"   TIMESTAMP(3),
    "expiresAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalSession_hashedToken_key" ON "ClientPortalSession"("hashedToken");

-- CreateIndex
CREATE INDEX "ClientPortalSession_userId_idx" ON "ClientPortalSession"("userId");

-- CreateIndex
CREATE INDEX "ClientPortalSession_clientId_idx" ON "ClientPortalSession"("clientId");

-- CreateIndex
CREATE INDEX "ClientPortalSession_userId_revokedAt_idx" ON "ClientPortalSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "ClientPortalSession_hashedToken_idx" ON "ClientPortalSession"("hashedToken");

-- AddForeignKey
ALTER TABLE "ClientPortalSession" ADD CONSTRAINT "ClientPortalSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalSession" ADD CONSTRAINT "ClientPortalSession_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: InvoicePublicLink
CREATE TABLE "InvoicePublicLink" (
    "id"           TEXT NOT NULL,
    "invoiceId"    TEXT NOT NULL,
    "hashedToken"  TEXT NOT NULL,
    "tokenHint"    VARCHAR(12) NOT NULL,
    "createdBy"    TEXT NOT NULL,
    "lastViewedAt" TIMESTAMP(3),
    "revokedAt"    TIMESTAMP(3),
    "expiresAt"    TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePublicLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePublicLink_hashedToken_key" ON "InvoicePublicLink"("hashedToken");

-- CreateIndex
CREATE INDEX "InvoicePublicLink_invoiceId_idx" ON "InvoicePublicLink"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoicePublicLink_invoiceId_revokedAt_idx" ON "InvoicePublicLink"("invoiceId", "revokedAt");

-- CreateIndex
CREATE INDEX "InvoicePublicLink_hashedToken_idx" ON "InvoicePublicLink"("hashedToken");

-- AddForeignKey
ALTER TABLE "InvoicePublicLink" ADD CONSTRAINT "InvoicePublicLink_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
