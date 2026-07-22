export const DEFAULT_OPENAI_ANALYSIS_MODEL = "gpt-5.4-nano";
export const DEFAULT_OPENAI_TOPIC_MODEL = "gpt-5-mini";

export function analysisReasoningEffort(model: string): "none" | "minimal" | "low" {
  if (/^gpt-5\.4-nano(?:-|$)/.test(model)) return "none";
  if (/^gpt-5-nano(?:-|$)/.test(model)) return "minimal";
  return "low";
}

export const OPENAI_TOPIC_REASONING_EFFORT = "low" as const;
