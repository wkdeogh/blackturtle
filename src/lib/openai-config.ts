export const DEFAULT_OPENAI_ANALYSIS_MODEL = "gpt-5.4-nano";
export const DEFAULT_OPENAI_TOPIC_MODEL = "gpt-5.4-nano";
export const DEFAULT_OPENAI_COMPREHENSIVE_MODEL = "gpt-5.6-luna";
export const OPENAI_COMPREHENSIVE_MODELS = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"] as const;
export type OpenAIComprehensiveModel = (typeof OPENAI_COMPREHENSIVE_MODELS)[number];

export function isOpenAIComprehensiveModel(value: unknown): value is OpenAIComprehensiveModel {
  return typeof value === "string" && OPENAI_COMPREHENSIVE_MODELS.some((model) => model === value);
}

export function resolveOpenAIComprehensiveModel(value: unknown): OpenAIComprehensiveModel {
  return isOpenAIComprehensiveModel(value) ? value : DEFAULT_OPENAI_COMPREHENSIVE_MODEL;
}

export const OPENAI_REASONING_EFFORT = "low" as const;
export const OPENAI_COMPREHENSIVE_REASONING_EFFORT = "medium" as const;
