import { isLearningEnabled, loadEnv } from "../config/env.js";
import { initVectorStore } from "./vector-store.js";
import { initGraphStore, shutdownGraphStore } from "./graph-store.js";
import { getLogger } from "../utils/logger.js";

export async function initLearningSystem(): Promise<void> {
  const env = loadEnv();
  const log = getLogger();

  if (!isLearningEnabled(env)) {
    log.info("Learning system disabled (QDRANT_URL or NEO4J_URI not set)");
    return;
  }

  log.info("Initializing learning system...");
  await Promise.all([initVectorStore(), initGraphStore()]);
  log.info("Learning system initialized");
}

export async function shutdownLearningSystem(): Promise<void> {
  await shutdownGraphStore();
}
