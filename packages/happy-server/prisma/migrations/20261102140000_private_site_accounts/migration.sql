CREATE TABLE "AccountLogin" (
    "accountId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "secretSalt" TEXT NOT NULL,
    "secretNonce" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountLogin_pkey" PRIMARY KEY ("accountId")
);
CREATE UNIQUE INDEX "AccountLogin_username_key" ON "AccountLogin"("username");
ALTER TABLE "AccountLogin" ADD CONSTRAINT "AccountLogin_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL,
    "administratorAccountId" TEXT NOT NULL,
    "icpNumber" TEXT NOT NULL DEFAULT '京ICP备2025125963号-1',
    "icpUrl" TEXT NOT NULL DEFAULT 'https://beian.miit.gov.cn/',
    "policeNumber" TEXT NOT NULL DEFAULT '京公网安备11010502056950号',
    "policeUrl" TEXT NOT NULL DEFAULT 'https://beian.mps.gov.cn/#/query/webSearch',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistrationInvite" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RegistrationInvite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RegistrationInvite_usage_check" CHECK ("maxUses" > 0 AND "usedCount" >= 0 AND "usedCount" <= "maxUses")
);
CREATE UNIQUE INDEX "RegistrationInvite_codeHash_key" ON "RegistrationInvite"("codeHash");
