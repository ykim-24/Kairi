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
      // Indexes for common query filters
      await session.run(
        "CREATE INDEX IF NOT EXISTS FOR (i:Interaction) ON (i.approved)"
      );
      await session.run(
        "CREATE INDEX IF NOT EXISTS FOR (i:Interaction) ON (i.timestamp)"
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

export async function clearRepoLearning(repo: string): Promise<number> {
  if (!_driver) return 0;
  const session = _driver.session();

  try {
    const result = await session.run(
      `
      MATCH (i:Interaction)-[:BELONGS_TO]->(r:Repo {name: $repo})
      WITH i, count(i) AS total
      DETACH DELETE i
      RETURN total
      `,
      { repo }
    );
    const deleted = result.records[0]?.get("total")?.toNumber?.() ?? 0;
    log.info({ repo, deleted }, "Cleared repo learning data from Neo4j");
    return deleted;
  } catch (err) {
    log.warn({ err, repo }, "Failed to clear repo learning data from Neo4j");
    return 0;
  } finally {
    await session.close();
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
        timestamp: datetime($timestamp),
        prAuthor: $prAuthor
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
        prAuthor: interaction.prAuthor ?? null,
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
      MATCH (c:Concept)<-[:RELATES_TO]-(i:Interaction)-[:BELONGS_TO]->(r:Repo {name: $repo})
      WHERE c.name IN $concepts
        AND i.approved IS NOT NULL
      WITH i, collect(c.name) AS matchedConcepts, count(c) AS relevance
      ORDER BY relevance DESC
      LIMIT $limit
      MATCH (i)-[:REVIEWED]->(f:File)
      RETURN i.id AS id, i.reviewComment AS reviewComment,
             i.diffContext AS diffContext, i.approved AS approved,
             i.category AS category, f.path AS filePath,
             i.pullNumber AS pullNumber, i.source AS source,
             i.prAuthor AS prAuthor, matchedConcepts, relevance
      `,
      { concepts, repo, limit: neo4j.int(limit) }
    );

    return result.records.map((r) => ({
      diffSnippet: r.get("diffContext") ?? "",
      reviewComment: r.get("reviewComment") ?? "",
      filePath: r.get("filePath") ?? "",
      category: r.get("category") ?? "",
      approved: r.get("approved"),
      pullNumber: (r.get("pullNumber") as any)?.toNumber?.() ?? r.get("pullNumber") ?? undefined,
      source: r.get("source") ?? undefined,
      prAuthor: r.get("prAuthor") ?? undefined,
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
    // Query by exact path OR by file name concept (stem-based matching)
    // This catches renamed/moved files that share the same name
    const fileConcept = `file:${filePath}`;
    const stem = filePath.split("/").pop()?.replace(/\.[^.]+$/, "").toLowerCase() ?? "";
    const stemConcept = stem.length > 2 ? `stem:${stem}` : null;

    // Use UNION to avoid expensive OR pattern matches — each branch starts from an indexed node
    const stemBranch = stemConcept
      ? `
      UNION
      MATCH (sc:Concept {name: $stemConcept})<-[:RELATES_TO]-(i:Interaction)-[:BELONGS_TO]->(r:Repo {name: $repo})
      WHERE i.approved IS NOT NULL
      MATCH (i)-[:REVIEWED]->(f:File)
      RETURN i.reviewComment AS reviewComment, i.diffContext AS diffContext,
             i.approved AS approved, i.category AS category, f.path AS filePath,
             i.pullNumber AS pullNumber, i.source AS source, i.prAuthor AS prAuthor, i.timestamp AS ts
      `
      : "";

    const result = await session.run(
      `
      MATCH (f0:File {path: $filePath})<-[:REVIEWED]-(i:Interaction)-[:BELONGS_TO]->(r:Repo {name: $repo})
      WHERE i.approved IS NOT NULL
      MATCH (i)-[:REVIEWED]->(f:File)
      RETURN i.reviewComment AS reviewComment, i.diffContext AS diffContext,
             i.approved AS approved, i.category AS category, f.path AS filePath,
             i.pullNumber AS pullNumber, i.source AS source, i.prAuthor AS prAuthor, i.timestamp AS ts
      UNION
      MATCH (fc:Concept {name: $fileConcept})<-[:RELATES_TO]-(i:Interaction)-[:BELONGS_TO]->(r:Repo {name: $repo})
      WHERE i.approved IS NOT NULL
      MATCH (i)-[:REVIEWED]->(f:File)
      RETURN i.reviewComment AS reviewComment, i.diffContext AS diffContext,
             i.approved AS approved, i.category AS category, f.path AS filePath,
             i.pullNumber AS pullNumber, i.source AS source, i.prAuthor AS prAuthor, i.timestamp AS ts
      ${stemBranch}
      ORDER BY ts DESC
      LIMIT $limit
      `,
      {
        filePath,
        repo,
        fileConcept,
        ...(stemConcept ? { stemConcept } : {}),
        limit: neo4j.int(limit),
      }
    );

    return result.records.map((r) => ({
      diffSnippet: r.get("diffContext") ?? "",
      reviewComment: r.get("reviewComment") ?? "",
      filePath: r.get("filePath") ?? "",
      category: r.get("category") ?? "",
      approved: r.get("approved"),
      pullNumber: (r.get("pullNumber") as any)?.toNumber?.() ?? r.get("pullNumber") ?? undefined,
      source: r.get("source") ?? undefined,
      prAuthor: r.get("prAuthor") ?? undefined,
      score: 1,
    }));
  } catch (err) {
    log.warn({ err }, "Failed to query file history from Neo4j");
    return [];
  } finally {
    await session.close();
  }
}
