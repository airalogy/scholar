ALTER TABLE "embeddings"
ADD COLUMN "bm25_length" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "bm25_terms" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX "idx_embeddings_bm25_terms"
ON "embeddings" USING GIN ("bm25_terms");
