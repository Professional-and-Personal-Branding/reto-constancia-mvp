-- AlterTable
ALTER TABLE "DailyActivity" ADD COLUMN     "resubmissionCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ActivityRejection" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityRejection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityRejection_activityId_rejectedAt_idx" ON "ActivityRejection"("activityId", "rejectedAt");

-- AddForeignKey
ALTER TABLE "ActivityRejection" ADD CONSTRAINT "ActivityRejection_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "DailyActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRejection" ADD CONSTRAINT "ActivityRejection_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one history entry for each existing REJECTED activity with a reason (idempotent).
-- Verbatim copy of prisma/sql/backfill-activity-rejections.sql
INSERT INTO "ActivityRejection" ("id", "activityId", "reason", "rejectedById", "rejectedAt")
SELECT gen_random_uuid()::text, a."id", a."rejectionReason", a."validatedById",
       COALESCE(a."validatedAt", a."updatedAt")
FROM "DailyActivity" a
WHERE a."status" = 'REJECTED' AND a."rejectionReason" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ActivityRejection" r
    WHERE r."activityId" = a."id" AND r."reason" = a."rejectionReason"
  );
