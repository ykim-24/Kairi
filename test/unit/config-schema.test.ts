import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { parseRepoConfig } from "../../src/config-loader/schema.js";
import { SAMPLE_CONFIG_YAML } from "../fixtures/sample-patch.js";

describe("config schema", () => {
  it("parses valid YAML config", () => {
    const raw = yaml.load(SAMPLE_CONFIG_YAML);
    const config = parseRepoConfig(raw);

    expect(config.enabled).toBe(true);
    expect(config.rules["no-console-log"].enabled).toBe(true);
    expect(config.rules["no-console-log"].severity).toBe("error");
    expect(config.rules["no-todo"].enabled).toBe(false);
    expect(config.llm.focusAreas).toContain("bugs");
    expect(config.llm.focusAreas).toContain("security");
  });

  it("applies defaults for missing fields", () => {
    const config = parseRepoConfig({});

    expect(config.enabled).toBe(true);
    expect(config.llm.enabled).toBe(true);
    expect(config.llm.model).toBe("claude-sonnet-4-20250514");
    expect(config.llm.maxTokenBudget).toBe(80000);
    expect(config.review.dismissOnUpdate).toBe(true);
    expect(config.learning.enabled).toBe(true);
  });

  it("rejects invalid temperature", () => {
    expect(() =>
      parseRepoConfig({ llm: { temperature: 2 } })
    ).toThrow();
  });

  it("handles empty rules", () => {
    const config = parseRepoConfig({ rules: {} });
    expect(config.rules).toEqual({});
  });
});
