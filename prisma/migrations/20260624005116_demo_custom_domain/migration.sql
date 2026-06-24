-- AlterTable
ALTER TABLE "Demo" ADD COLUMN     "customDomain" TEXT,
ADD COLUMN     "customDomainStatus" TEXT NOT NULL DEFAULT 'None',
ADD COLUMN     "lastDnsCheck" TEXT;
