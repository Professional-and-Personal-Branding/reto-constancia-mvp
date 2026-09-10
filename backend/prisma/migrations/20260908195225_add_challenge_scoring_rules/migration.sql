-- CreateEnum
CREATE TYPE "TiebreakRule" AS ENUM ('DRAW', 'TOTAL_KM', 'SHARE_ALL');

-- AlterTable
ALTER TABLE "Challenge" ADD COLUMN     "maxWinners" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "minValidatedDaysToQualify" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsPerKm" DECIMAL(6,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pointsPerValidatedDay" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tiebreakRule" "TiebreakRule" NOT NULL DEFAULT 'DRAW';
