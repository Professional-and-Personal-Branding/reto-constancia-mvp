-- Presupuesto automático (spec challenge-finance, cambio pot-from-collected).
-- budgetTotal pasa a ser opcional: NULL = automático (cuota × inscritos), un número = fijado a mano.

-- AlterTable
ALTER TABLE "Challenge" ALTER COLUMN "budgetTotal" DROP NOT NULL,
ALTER COLUMN "budgetTotal" DROP DEFAULT;

-- Datos existentes: un presupuesto en 0 nunca se fijó, y uno igual a cuota × inscritos es el
-- cálculo automático; ambos pasan a automático. Cualquier otro valor se conserva como manual.
UPDATE "Challenge" AS c
SET "budgetTotal" = NULL
WHERE c."budgetTotal" = 0
   OR c."budgetTotal" = c."feePerParticipant" * (
        SELECT COUNT(*) FROM "ChallengeParticipant" AS p WHERE p."challengeId" = c."id"
      );
