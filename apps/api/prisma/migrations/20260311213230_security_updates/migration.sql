/*
  Warnings:

  - You are about to drop the column `token` on the `EmailVerification` table. All the data in the column will be lost.
  - You are about to drop the column `token` on the `Invite` table. All the data in the column will be lost.
  - Added the required column `tokenHash` to the `EmailVerification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tokenHash` to the `Invite` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EmailVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EmailVerification" ("createdAt", "expiresAt", "id", "userId") SELECT "createdAt", "expiresAt", "id", "userId" FROM "EmailVerification";
DROP TABLE "EmailVerification";
ALTER TABLE "new_EmailVerification" RENAME TO "EmailVerification";
CREATE UNIQUE INDEX "EmailVerification_userId_key" ON "EmailVerification"("userId");
CREATE UNIQUE INDEX "EmailVerification_tokenHash_key" ON "EmailVerification"("tokenHash");
CREATE TABLE "new_Invite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "syndicateId" TEXT NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "invitedName" TEXT NOT NULL,
    "inviteMessage" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" DATETIME NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" DATETIME,
    CONSTRAINT "Invite_syndicateId_fkey" FOREIGN KEY ("syndicateId") REFERENCES "Syndicate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Invite" ("acceptedAt", "createdAt", "createdByUserId", "expiresAt", "id", "inviteMessage", "invitedEmail", "invitedName", "status", "syndicateId") SELECT "acceptedAt", "createdAt", "createdByUserId", "expiresAt", "id", "inviteMessage", "invitedEmail", "invitedName", "status", "syndicateId" FROM "Invite";
DROP TABLE "Invite";
ALTER TABLE "new_Invite" RENAME TO "Invite";
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
