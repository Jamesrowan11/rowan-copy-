-- CreateTable
CREATE TABLE "MailboxRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "desiredLocal" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT 'rowancopy.com',
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "decisionNote" TEXT,
    "mailboxId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MailboxRequest" ADD CONSTRAINT "MailboxRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxRequest" ADD CONSTRAINT "MailboxRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
