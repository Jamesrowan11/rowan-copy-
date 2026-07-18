-- AlterTable
ALTER TABLE "Demo" ADD COLUMN     "outreachSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BoardRun" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'schedule',
    "actions" INTEGER NOT NULL DEFAULT 0,
    "report" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BoardRun_pkey" PRIMARY KEY ("id")
);
