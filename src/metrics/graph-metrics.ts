import neo4j, { type Driver } from "neo4j-driver";
import { loadEnv } from "../config/env.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "graph-metrics" });

let _driver: Driver | null = null;

export async function initGraphMetrics(): Promise<void> {
  const env = loadEnv();
  if (!env.NEO4J_URI || !env.NEO4J_PASSWORD) return;

  try {
    _driver = neo4j.driver(
      env.NEO4J_URI,
      neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD)
    );
    log.info("Graph metrics connected to Neo4j");
  } catch (err) {
    log.warn({ err }, "Graph metrics: failed to connect to Neo4j");
  }
}

export async function shutdownGraphMetrics(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

/** Which concepts have the highest/lowest approval rates? */
export async function getConceptApprovalRates(
  repo?: string
): Promise<Array<{ concept: string; total: number; approved: number; rejected: number; rate: number }>> {
  if (!_driver) return [];
  const session = _driver.session();

  try {
    const repoFilter = repo
      ? "AND (i)-[:BELONGS_TO]->(:Repo {name: $repo})"
      : "";

    const result = await session.run(
      `
      MATCH (i:Interaction)-[:RELATES_TO]->(c:Concept)
      WHERE i.approved IS NOT NULL
      ${repoFilter}
      WITH c.name AS concept,
           count(i) AS total,
           sum(CASE WHEN i.approved = true THEN 1 ELSE 0 END) AS approved,
           sum(CASE WHEN i.approved = false THEN 1 ELSE 0 END) AS rejected
      WHERE total >= 3
      RETURN concept, total, approved, rejected,
             toFloat(approved) / total AS rate
      ORDER BY rate DESC
      `,
      repo ? { repo } : {}
    );

    return result.records.map((r) => ({
      concept: r.get("concept"),
      total: (r.get("total") as any).toNumber(),
      approved: (r.get("approved") as any).toNumber(),
      rejected: (r.get("rejected") as any).toNumber(),
      rate: r.get("rate"),
    }));
  } catch (err) {
    log.warn({ err }, "Failed to query concept approval rates");
    return [];
  } finally {
    await session.close();
  }
}

/** Which files get the most review comments, and what are the top concepts per file? */
export async function getFileHotspots(
  repo?: string,
  limit = 20
): Promise<Array<{ file: string; commentCount: number; topConcepts: string[] }>> {
  if (!_driver) return [];
  const session = _driver.session();

  try {
    const repoFilter = repo
      ? "AND (i)-[:BELONGS_TO]->(:Repo {name: $repo})"
      : "";

    const result = await session.run(
      `
      MATCH (i:Interaction)-[:REVIEWED]->(f:File)
      WHERE i.approved IS NOT NULL
      ${repoFilter}
      WITH f.path AS file, collect(i) AS interactions, count(i) AS commentCount
      WHERE commentCount >= 2
      UNWIND interactions AS i
      OPTIONAL MATCH (i)-[:RELATES_TO]->(c:Concept)
      WITH file, commentCount, c.name AS concept, count(*) AS freq
      ORDER BY freq DESC
      WITH file, commentCount, collect(concept)[0..3] AS topConcepts
      RETURN file, commentCount, topConcepts
      ORDER BY commentCount DESC
      LIMIT $limit
      `,
      { ...(repo ? { repo } : {}), limit: neo4j.int(limit) }
    );

    return result.records.map((r) => ({
      file: r.get("file"),
      commentCount: (r.get("commentCount") as any).toNumber(),
      topConcepts: (r.get("topConcepts") as string[]).filter(Boolean),
    }));
  } catch (err) {
    log.warn({ err }, "Failed to query file hotspots");
    return [];
  } finally {
    await session.close();
  }
}

/** Get the concept graph — which concepts appear together and how successful are reviews in those areas */
export async function getConceptGraph(
  repo?: string,
  minCooccurrence = 3
): Promise<Array<{ source: string; target: string; weight: number; avgApproval: number }>> {
  if (!_driver) return [];
  const session = _driver.session();

  try {
    const repoFilter = repo
      ? "AND (i)-[:BELONGS_TO]->(:Repo {name: $repo})"
      : "";

    const result = await session.run(
      `
      MATCH (c1:Concept)<-[:RELATES_TO]-(i:Interaction)-[:RELATES_TO]->(c2:Concept)
      WHERE c1.name < c2.name
        AND i.approved IS NOT NULL
        ${repoFilter}
      WITH c1.name AS source, c2.name AS target,
           count(i) AS weight,
           avg(CASE WHEN i.approved THEN 1.0 ELSE 0.0 END) AS avgApproval
      WHERE weight >= $minCooccurrence
      RETURN source, target, weight, avgApproval
      ORDER BY weight DESC
      LIMIT 50
      `,
      { ...(repo ? { repo } : {}), minCooccurrence: neo4j.int(minCooccurrence) }
    );

    return result.records.map((r) => ({
      source: r.get("source"),
      target: r.get("target"),
      weight: (r.get("weight") as any).toNumber(),
      avgApproval: r.get("avgApproval"),
    }));
  } catch (err) {
    log.warn({ err }, "Failed to query concept graph");
    return [];
  } finally {
    await session.close();
  }
}

/** Knowledge base health: total interactions, approved/rejected/pending counts */
export async function getKnowledgeBaseStats(
  repo?: string
): Promise<{ total: number; approved: number; rejected: number; pending: number }> {
  if (!_driver) return { total: 0, approved: 0, rejected: 0, pending: 0 };
  const session = _driver.session();

  try {
    const repoFilter = repo
      ? "WHERE (i)-[:BELONGS_TO]->(:Repo {name: $repo})"
      : "";

    const result = await session.run(
      `
      MATCH (i:Interaction)
      ${repoFilter}
      RETURN count(i) AS total,
             sum(CASE WHEN i.approved = true THEN 1 ELSE 0 END) AS approved,
             sum(CASE WHEN i.approved = false THEN 1 ELSE 0 END) AS rejected,
             sum(CASE WHEN i.approved IS NULL THEN 1 ELSE 0 END) AS pending
      `,
      repo ? { repo } : {}
    );

    const r = result.records[0];
    return {
      total: (r.get("total") as any).toNumber(),
      approved: (r.get("approved") as any).toNumber(),
      rejected: (r.get("rejected") as any).toNumber(),
      pending: (r.get("pending") as any).toNumber(),
    };
  } catch (err) {
    log.warn({ err }, "Failed to query knowledge base stats");
    return { total: 0, approved: 0, rejected: 0, pending: 0 };
  } finally {
    await session.close();
  }
}
