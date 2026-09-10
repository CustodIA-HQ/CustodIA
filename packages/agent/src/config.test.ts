import { describe, expect, it } from "vitest";
import { loadAgentEnv } from "./config.js";

describe("agent model configuration", () => {
  it.each([undefined, "", "   "])("uses the default for an empty model override: %s", (model) => {
    expect(loadAgentEnv({ OPENAI_API_KEY: "test", OPENAI_MODEL: model }).openaiModel).toBe(
      "gpt-5.6-luna",
    );
  });
  it("trims a configured model override", () => {
    expect(
      loadAgentEnv({ OPENAI_API_KEY: "test", OPENAI_MODEL: " configured-model " }).openaiModel,
    ).toBe("configured-model");
  });
  it("disables reasoning effort for Luna function tools", () => {
    expect(
      loadAgentEnv({
        OPENAI_API_KEY: "test",
        OPENAI_REASONING_EFFORT: "low",
      }).reasoningEffort,
    ).toBe("none");
  });
  it("keeps the configured effort for other models", () => {
    expect(
      loadAgentEnv({
        OPENAI_API_KEY: "test",
        OPENAI_MODEL: "gpt-5.6-terra",
        OPENAI_REASONING_EFFORT: "low",
      }).reasoningEffort,
    ).toBe("low");
  });
});
