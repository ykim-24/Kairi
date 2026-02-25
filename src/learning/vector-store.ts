import { QdrantClient } from "@qdrant/js-client-rest";
import { getAnthropicClient } from "../llm/client.js";
import { loadEnv, isLearningEnabled } from "../config/env.js";
import type { ReviewInteraction, RetrievedPattern } from "./types.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "vector-store" });

let _client: QdrantClient | null = null;
let _collection: string;

const VECTOR_SIZE = 1024; // voyage/embed dimension — we'll use Anthropic's embedding via text->hash approach

export async function initVectorStore(): Promise<void> {
  const env = loadEnv();
  if (!env.QDRANT_URL) return;

  _client = new QdrantClient({ url: env.QDRANT_URL });
  _collection = env.QDRANT_COLLECTION;

  try {
    const collections = await _client.getCollections();
    const exists = collections.collections.some((c) => c.name === _collection);
    if (!exists) {
      await _client.createCollection(_collection, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" },
      });
      log.info({ collection: _collection }, "Created Qdrant collection");
    }
  } catch (err) {
    log.error({ err }, "Failed to initialize Qdrant");
    _client = null;
  }
}

export async function storeInteraction(
  interaction: ReviewInteraction
): Promise<void> {
  if (!_client) return;

  try {
    const vector = await embedText(
      `REVIEW: ${interaction.diffContext}\nCOMMENT: ${interaction.reviewComment}`
    );

    await _client.upsert(_collection, {
      wait: true,
      points: [
        {
          id: interaction.id,
          vector,
          payload: {
            repo: interaction.repo,
            pullNumber: interaction.pullNumber,
            diffContext: interaction.diffContext.slice(0, 2000),
            reviewComment: interaction.reviewComment,
            filePath: interaction.filePath,
            line: interaction.line,
            category: interaction.category,
            approved: interaction.approved,
            concepts: interaction.concepts,
            source: interaction.source,
            severity: interaction.severity,
            timestamp: interaction.timestamp,
          },
        },
      ],
    });
  } catch (err) {
    log.warn({ err, id: interaction.id }, "Failed to store interaction in Qdrant");
  }
}

export async function updateApproval(
  interactionId: string,
  approved: boolean
): Promise<void> {
  if (!_client) return;

  try {
    await _client.setPayload(_collection, {
      payload: { approved },
      points: [interactionId],
      wait: true,
    });
  } catch (err) {
    log.warn({ err, id: interactionId }, "Failed to update approval in Qdrant");
  }
}

export async function searchSimilar(
  query: string,
  repo: string,
  limit = 10
): Promise<RetrievedPattern[]> {
  if (!_client) return [];

  try {
    const vector = await embedText(query);
    const results = await _client.search(_collection, {
      vector,
      limit,
      filter: {
        must: [{ key: "repo", match: { value: repo } }],
      },
      with_payload: true,
    });

    return results.map((r) => ({
      diffSnippet: (r.payload?.diffContext as string) ?? "",
      reviewComment: (r.payload?.reviewComment as string) ?? "",
      filePath: (r.payload?.filePath as string) ?? "",
      category: (r.payload?.category as string) ?? "",
      approved: r.payload?.approved as boolean | null,
      score: r.score,
    }));
  } catch (err) {
    log.warn({ err }, "Failed to search Qdrant");
    return [];
  }
}

/**
 * Simple embedding using a hash-based approach for when no embedding model is available.
 * In production, replace with a proper embedding endpoint (e.g., Voyage, OpenAI, or local model).
 */
async function embedText(text: string): Promise<number[]> {
  // Use a deterministic pseudo-embedding based on character n-grams
  // This is a lightweight approach — for better quality, swap in a real embedding model
  const vector = new Float32Array(VECTOR_SIZE).fill(0);
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();

  // Character trigram hashing into vector dimensions
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.slice(i, i + 3);
    let hash = 0;
    for (let j = 0; j < trigram.length; j++) {
      hash = (hash * 31 + trigram.charCodeAt(j)) & 0x7fffffff;
    }
    const idx = hash % VECTOR_SIZE;
    vector[idx] += 1;
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < VECTOR_SIZE; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;
  const result: number[] = [];
  for (let i = 0; i < VECTOR_SIZE; i++) result.push(vector[i] / norm);

  return result;
}
