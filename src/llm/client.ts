import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "../config/env.js";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  const env = loadEnv();
  _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}
