-- Backfill del historial de rechazos (cambio resubmit-rejected-activity-2, design D3).
-- Idempotente: solo inserta un registro por cada actividad REJECTED cuyo motivo vigente aun no
-- tiene entrada. Se copia al final de la migracion y sirve como paso de recuperacion tras volver
-- a la 1.14.0 y desplegar de nuevo:
--   npx prisma db execute --file prisma/sql/backfill-activity-rejections.sql
INSERT INTO "ActivityRejection" ("id", "activityId", "reason", "rejectedById", "rejectedAt")
SELECT gen_random_uuid()::text, a."id", a."rejectionReason", a."validatedById",
       COALESCE(a."validatedAt", a."updatedAt")
FROM "DailyActivity" a
WHERE a."status" = 'REJECTED' AND a."rejectionReason" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ActivityRejection" r
    WHERE r."activityId" = a."id" AND r."reason" = a."rejectionReason"
  );
