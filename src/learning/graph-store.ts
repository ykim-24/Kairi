import neo4j, { type Driver, type Session } from "neo4j-driver";
import { loadEnv } from "../config/env.js";
import type { ReviewInteraction, RetrievedPattern } from "./types.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "graph-store" });

let _driver: Driver | null = null;

export async function initGraphStore(): Promise<void> {
  const env = loadEnv();
  if (!env.NEO4J_URI || !env.NEO4J_PASSWORD) return;

  try {
    _driver = neo4j.driver(
      env.NEO4J_URI,
      neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD)
    );

    // Verify connectivity and set up constraints
    const session = _driver.session();
    try {
      await session.run(
        "CREATE CONSTRAINT IF NOT EXISTS FOR (i:Interaction) REQUIRE i.id IS UNIQUE"
      );
      await session.run(
        "CREATE CONSTRAINT IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE"
      );
      await session.run(
        "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Concept) REQUIRE c.name IS UNIQUE"
      );
      await session.run(
        "CREATE CONSTRAINT IF NOT EXISTS FOR (r:Repo) REQUIRE r.name IS UNIQUE"
      );
      log.info("Neo4j graph store initialized with constraints");
    } finally {
      await session.close();
    }
  } catch (err) {
    log.error({ err }, "Failed to initialize Neo4j");
    _driver = null;
  }
}

export async function shutdownGraphStore(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

export async function storeInteraction(
  interaction: ReviewInteraction
): Promise<void> {
  if (!_driver) return;
  const session = _driver.session();

  try {
    // Create Interaction node + relationships in a single transaction
    await session.run(
      `
      MERGE (r:Repo {name: $repo})
      CREATE (i:Interaction {
        id: $id,
        reviewComment: $reviewComment,
        diffContext: $diffContext,
        approved: $approved,
        category: $category,
        source: $source,
        severity: $severity,
        pullNumber: $pullNumber,
        line: $line,
        timestamp: datetime($timestamp)
      })
      MERGE (f:File {path: $filePath})
      CREATE (i)-[:REVIEWED]->(f)
      CREATE (i)-[:BELONGS_TO]->(r)
      WITH i
      UNWIND $concepts AS conceptName
        MERGE (c:Concept {name: conceptName})
        CREATE (i)-[:RELATES_TO]->(c)
      `,
      {
        id: interaction.id,
        repo: interaction.repo,
        reviewComment: interaction.reviewComment,
        diffContext: interaction.diffContext.slice(0, 2000),
        approved: interaction.approved,
        category: interaction.category,
        source: interaction.source,
        severity: interaction.severity,
        pullNumber: interaction.pullNumber,
        filePath: interaction.filePath,
        line: interaction.line,
        timestamp: interaction.timestamp,
        concepts: interaction.concepts,
      }
    );
  } catch (err) {
    log.warn({ err, id: interaction.id }, "Failed to store interaction in Neo4j");
  } finally {
    await session.close();
  }
}

export async function updateApproval(
  interactionId: string,
  approved: boolean
): Promise<void> {
  if (!_driver) return;
  const session = _driver.session();

  try {
    await session.run(
      "MATCH (i:Interaction {id: $id}) SET i.approved = $approved",
      { id: interactionId, approved }
    );
  } catch (err) {
    log.warn({ err, id: interactionId }, "Failed to update approval in Neo4j");
  } finally {
    await session.close();
  }
}

export async function getRelatedInteractions(
  concepts: string[],
  repo: string,
  limit = 5
): Promise<RetrievedPattern[]> {
  if (!_driver || concepts.length === 0) return [];
  const session = _driver.session();

  try {
    const result = await session.run(
      `
      MATCH (i:Interaction)-[:RELATES_TO]->(c:Concept)
      WHERE c.name IN $concepts
        AND (i)-[:BELONGS_TO]->(:Repo {name: $repo})
        AND i.approved IS NOT NULL
      WITH i, collect(c.name) AS matchedConcepts, count(c) AS relevance
      ORDER BY relevance DESC
      LIMIT $limit
      MATCH (i)-[:REVIEWED]->(f:File)
      RETURN i.id AS id, i.reviewComment AS reviewComment,
             i.diffContext AS diffContext, i.approved AS approved,
             i.category AS category, f.path AS filePath,
             matchedConcepts, relevance
      `,
      { concepts, repo, limit: neo4j.int(limit) }
    );

    return result.records.map((r) => ({
      diffSnippet: r.get("diffContext") ?? "",
      reviewComment: r.get("reviewComment") ?? "",
      filePath: r.get("filePath") ?? "",
      category: r.get("category") ?? "",
      approved: r.get("approved"),
      score: (r.get("relevance") as any)?.toNumber?.() ?? 0,
    }));
  } catch (err) {
    log.warn({ err }, "Failed to query related interactions from Neo4j");
    return [];
  } finally {
    await session.close();
  }
}

export async function getFileHistory(
  filePath: string,
  repo: string,
  limit = 5
): Promise<RetrievedPattern[]> {
  if (!_driver) return [];
  const session = _driver.session();

  try {
    const result = await session.run(
      `
      MATCH (i:Interaction)-[:REVIEWED]->(f:File {path: $filePath})
      WHERE (i)-[:BELONGS_TO]->(:Repo {name: $repo})
        AND i.approved IS NOT NULL
      RETURN i.reviewComment AS reviewComment, i.diffContext AS diffContext,
             i.approved AS approved, i.category AS category, f.path AS filePath
      ORDER BY i.timestamp DESC
      LIMIT $limit
      `,
      { filePath, repo, limit: neo4j.int(limit) }
    );

    return result.records.map((r) => ({
      diffSnippet: r.get("diffContext") ?? "",
      reviewComment: r.get("reviewComment") ?? "",
      filePath: r.get("filePath") ?? "",
      category: r.get("category") ?? "",
      approved: r.get("approved"),
      score: 1,
    }));
  } catch (err) {
    log.warn({ err }, "Failed to query file history from Neo4j");
    return [];
  } finally {
    await session.close();
  }
}
