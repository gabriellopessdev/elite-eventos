-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "pin" TEXT;

-- Backfill unique 6-digit pins per session (existing rows only).
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY created_at, id) AS n
  FROM "tickets"
)
UPDATE "tickets" AS t
SET "pin" = LPAD(numbered.n::text, 6, '0')
FROM numbered
WHERE t.id = numbered.id;

-- AlterTable
ALTER TABLE "tickets" ALTER COLUMN "pin" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tickets_event_id_pin_key" ON "tickets"("event_id", "pin");
