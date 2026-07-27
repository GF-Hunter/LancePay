-- CreateTable: DigestEmailSettings
CREATE TABLE "DigestEmailSettings" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "enabled"    BOOLEAN NOT NULL DEFAULT true,
    "frequency"  TEXT NOT NULL DEFAULT 'weekly',
    "lastSentAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestEmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigestEmailSettings_userId_key" ON "DigestEmailSettings"("userId");

-- AddForeignKey
ALTER TABLE "DigestEmailSettings" ADD CONSTRAINT "DigestEmailSettings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
