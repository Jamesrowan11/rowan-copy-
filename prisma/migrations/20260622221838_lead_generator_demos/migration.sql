-- CreateTable
CREATE TABLE "Demo" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "currentWebsite" TEXT,
    "subdomainLabel" TEXT,
    "liveUrl" TEXT,
    "researchSummary" TEXT,
    "foundExistingSite" BOOLEAN,
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Queued',
    "createdById" TEXT NOT NULL,
    "convertedProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Demo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Demo" ADD CONSTRAINT "Demo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
