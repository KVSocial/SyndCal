-- CreateTable
CREATE TABLE "JvzooCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "verifiedAt" DATETIME,
    "verificationError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JvzooCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AffiliateTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syndicateId" TEXT,
    "date" DATETIME NOT NULL,
    "productName" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "affiliateCommission" DECIMAL NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffiliateTransaction_syndicateId_fkey" FOREIGN KEY ("syndicateId") REFERENCES "Syndicate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyndicateSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "syndicateId" TEXT NOT NULL,
    "leaderboardMetric" TEXT NOT NULL DEFAULT 'sales',
    "showSalesCount" BOOLEAN NOT NULL DEFAULT true,
    "showRevenue" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyndicateSetting_syndicateId_fkey" FOREIGN KEY ("syndicateId") REFERENCES "Syndicate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JvzooCredential_userId_key" ON "JvzooCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateTransaction_transactionId_key" ON "AffiliateTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "AffiliateTransaction_userId_date_idx" ON "AffiliateTransaction"("userId", "date");

-- CreateIndex
CREATE INDEX "AffiliateTransaction_syndicateId_date_idx" ON "AffiliateTransaction"("syndicateId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SyndicateSetting_syndicateId_key" ON "SyndicateSetting"("syndicateId");
