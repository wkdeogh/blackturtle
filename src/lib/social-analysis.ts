import type { CompanyMention, MentionSummary, Sentiment, SocialPost } from "@/lib/types";

interface CompanyDefinition {
  ticker: string;
  name: string;
  aliases: string[];
}

const COMPANIES: CompanyDefinition[] = [
  { ticker: "AAPL", name: "Apple", aliases: ["apple", "iphone", "애플"] },
  { ticker: "MSFT", name: "Microsoft", aliases: ["microsoft", "azure", "마이크로소프트"] },
  { ticker: "NVDA", name: "NVIDIA", aliases: ["nvidia", "엔비디아", "blackwell"] },
  { ticker: "AMZN", name: "Amazon", aliases: ["amazon", "aws", "아마존"] },
  { ticker: "GOOGL", name: "Alphabet", aliases: ["alphabet", "google", "gemini", "구글"] },
  { ticker: "META", name: "Meta", aliases: ["meta platforms", "facebook", "instagram", "메타"] },
  { ticker: "TSLA", name: "Tesla", aliases: ["tesla", "테슬라", "cybertruck"] },
  { ticker: "AVGO", name: "Broadcom", aliases: ["broadcom", "브로드컴"] },
  { ticker: "AMD", name: "AMD", aliases: ["advanced micro devices", "amd"] },
  { ticker: "PLTR", name: "Palantir", aliases: ["palantir", "팔란티어"] },
  { ticker: "NFLX", name: "Netflix", aliases: ["netflix", "넷플릭스"] },
  { ticker: "COIN", name: "Coinbase", aliases: ["coinbase", "코인베이스"] },
  { ticker: "MSTR", name: "Strategy", aliases: ["microstrategy", "strategy"] },
  { ticker: "JPM", name: "JPMorgan", aliases: ["jpmorgan", "jp morgan", "제이피모건"] },
  { ticker: "BRK.B", name: "Berkshire Hathaway", aliases: ["berkshire", "버크셔"] },
];

const POSITIVE = [
  "beat", "beats", "bullish", "buy", "growth", "strong", "upside", "upgrade", "outperform", "record", "profit", "surge", "winner", "great", "좋", "상승", "성장", "호재", "매수", "강세", "돌파", "최고",
];
const NEGATIVE = [
  "miss", "misses", "bearish", "sell", "weak", "downside", "downgrade", "underperform", "loss", "drop", "risk", "fraud", "overvalued", "bad", "하락", "악재", "매도", "약세", "위험", "부진", "손실",
];
const NEGATIONS = ["not", "never", "no ", "isn't", "wasn't", "않", "아니"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsAlias(text: string, alias: string): boolean {
  if (/^[a-z0-9.]+$/i.test(alias)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}([^a-z0-9]|$)`, "i").test(text);
  }
  return text.toLowerCase().includes(alias.toLowerCase());
}

function sentenceFor(text: string, company: CompanyDefinition): string {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  return sentences.find((sentence) => company.aliases.some((alias) => containsAlias(sentence, alias)) || containsAlias(sentence, `$${company.ticker}`)) ?? text;
}

function classify(text: string): { sentiment: Sentiment; confidence: number } {
  const normalized = text.toLowerCase();
  let score = 0;
  for (const word of POSITIVE) if (normalized.includes(word)) score += 1;
  for (const word of NEGATIVE) if (normalized.includes(word)) score -= 1;
  if (NEGATIONS.some((word) => normalized.includes(word))) score *= -1;
  if (score > 0) return { sentiment: "positive", confidence: Math.min(0.92, 0.62 + score * 0.08) };
  if (score < 0) return { sentiment: "negative", confidence: Math.min(0.92, 0.62 + Math.abs(score) * 0.08) };
  return { sentiment: "neutral", confidence: 0.52 };
}

function companyCandidates(text: string): CompanyDefinition[] {
  const cashtags = Array.from(text.matchAll(/\$([A-Z]{1,6}(?:\.[A-Z])?)/g), (match) => match[1]);
  const result = new Map<string, CompanyDefinition>();
  for (const company of COMPANIES) {
    if (cashtags.includes(company.ticker) || company.aliases.some((alias) => containsAlias(text, alias))) {
      result.set(company.ticker, company);
    }
  }
  for (const ticker of cashtags) {
    if (!result.has(ticker)) result.set(ticker, { ticker, name: ticker, aliases: [] });
  }
  return [...result.values()];
}

export function analyzePost(post: Omit<SocialPost, "mentions">): SocialPost {
  const mentions: CompanyMention[] = companyCandidates(post.text).map((company) => {
    const evidence = sentenceFor(post.text, company).slice(0, 220);
    return { ticker: company.ticker, name: company.name, evidence, ...classify(evidence) };
  });
  return { ...post, mentions };
}

export function aggregateMentions(posts: SocialPost[]): MentionSummary[] {
  const summary = new Map<string, MentionSummary>();
  for (const post of posts) {
    for (const mention of post.mentions) {
      const current = summary.get(mention.ticker) ?? {
        ticker: mention.ticker,
        name: mention.name,
        total: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
        lastMentionAt: post.postedAt,
      };
      current.total += 1;
      current[mention.sentiment] += 1;
      if (post.postedAt > current.lastMentionAt) current.lastMentionAt = post.postedAt;
      summary.set(mention.ticker, current);
    }
  }
  return [...summary.values()].sort((left, right) => right.total - left.total || right.positive - left.positive);
}
