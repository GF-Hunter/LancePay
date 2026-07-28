-- CreateTable: LoginNotificationSettings
CREATE TABLE "LoginNotificationSettings" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "notifyOnNewDevice" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmail"       TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginNotificationSettings_userId_key" ON "LoginNotificationSettings"("userId");

-- AddForeignKey
ALTER TABLE "LoginNotificationSettings" ADD CONSTRAINT "LoginNotificationSettings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
