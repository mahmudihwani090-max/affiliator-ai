CREATE TABLE "video_queue_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "provider" TEXT NOT NULL DEFAULT 'google-flow',
    "prompt" TEXT,
    "aspectRatio" TEXT,
    "model" TEXT,
    "requestPayload" JSONB NOT NULL,
    "resultPayload" JSONB,
    "useapiJobId" TEXT,
    "replyUrl" TEXT,
    "replyRef" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_queue_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_queue_items_useapiJobId_key" ON "video_queue_items"("useapiJobId");
CREATE INDEX "video_queue_items_userId_status_createdAt_idx" ON "video_queue_items"("userId", "status", "createdAt");
CREATE INDEX "video_queue_items_userId_operation_createdAt_idx" ON "video_queue_items"("userId", "operation", "createdAt");

ALTER TABLE "video_queue_items"
ADD CONSTRAINT "video_queue_items_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;