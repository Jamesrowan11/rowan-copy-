-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mailAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mailDomain" TEXT,
ADD COLUMN     "mailWorkspaceOwnerId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_mailWorkspaceOwnerId_fkey" FOREIGN KEY ("mailWorkspaceOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
