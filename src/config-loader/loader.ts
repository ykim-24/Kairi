import type { Octokit } from "@octokit/rest";
import yaml from "js-yaml";
import { parseRepoConfig, type RepoConfig } from "./schema.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "config-loader" });

const CONFIG_FILENAME = ".kairi.yml";

export async function loadRepoConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string
): Promise<RepoConfig> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: CONFIG_FILENAME,
      ref,
    });

    if (!("content" in data) || !data.content) {
      log.debug({ owner, repo }, "Config file exists but has no content");
      return DEFAULT_CONFIG;
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8");
    const raw = yaml.load(content);
    const config = parseRepoConfig(raw);

    // Deep merge with defaults: repo config overrides defaults
    return mergeConfigs(DEFAULT_CONFIG, config);
  } catch (err: any) {
    if (err.status === 404) {
      log.debug({ owner, repo }, "No .kairi.yml found, using defaults");
      return DEFAULT_CONFIG;
    }
    log.warn({ err, owner, repo }, "Failed to load .kairi.yml, using defaults");
    return DEFAULT_CONFIG;
  }
}

function mergeConfigs(defaults: RepoConfig, overrides: RepoConfig): RepoConfig {
  return {
    enabled: overrides.enabled,
    rules: { ...defaults.rules, ...overrides.rules },
    llm: { ...defaults.llm, ...overrides.llm },
    filters: {
      ...defaults.filters,
      ...overrides.filters,
      excludePaths: [
        ...new Set([
          ...(defaults.filters.excludePaths ?? []),
          ...(overrides.filters.excludePaths ?? []),
        ]),
      ],
    },
    review: { ...defaults.review, ...overrides.review },
    learning: { ...defaults.learning, ...overrides.learning },
  };
}
