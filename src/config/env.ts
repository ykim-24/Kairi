import { z } from "zod";

const envSchema = z.object({
  // GitHub App
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_PRIVATE_KEY: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1),

  // PostgreSQL (metrics)
  POSTGRES_URL: z.string().optional(),

  // Learning System (optional)
  QDRANT_URL: z.string().url().optional(),
  QDRANT_COLLECTION: z.string().default("kairi_reviews"),
  NEO4J_URI: z.string().optional(),
  NEO4J_USER: z.string().default("neo4j"),
  NEO4J_PASSWORD: z.string().optional(),

  // Server
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  if (_env) return _env;

  const raw = { ...process.env };

  // Decode base64 private key if needed
  if (raw.GITHUB_PRIVATE_KEY && !raw.GITHUB_PRIVATE_KEY.includes("BEGIN")) {
    raw.GITHUB_PRIVATE_KEY = Buffer.from(
      raw.GITHUB_PRIVATE_KEY,
      "base64"
    ).toString("utf-8");
  }

  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${missing}`);
  }

  _env = result.data;
  return _env;
}

export function isLearningEnabled(env: Env): boolean {
  return !!(env.QDRANT_URL && env.NEO4J_URI && env.NEO4J_PASSWORD);
}
