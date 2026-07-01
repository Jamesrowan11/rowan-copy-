-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "customDomain" TEXT,
ADD COLUMN     "customDomainStatus" TEXT NOT NULL DEFAULT 'None';
