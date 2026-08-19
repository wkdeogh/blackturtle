import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { isSameOriginPost } from "@/lib/session";
import { getPortfolioItems, getSupabaseAdmin } from "@/lib/supabase";

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  ticker: z.string().trim().transform((value) => value.replace(/^\$/, "").toUpperCase()).pipe(z.string().regex(/^[A-Z][A-Z0-9.-]{0,14}$/)),
  companyName: z.string().trim().max(120).default(""),
  kind: z.enum(["holding", "watchlist"]),
  quantity: z.coerce.number().finite().min(0).default(0),
  averageCost: z.union([z.coerce.number().finite().min(0), z.null()]).default(null),
  targetWeight: z.union([z.coerce.number().finite().min(0).max(100), z.null()]).default(null),
  sector: z.string().trim().max(80).default(""),
  currency: z.enum(["USD", "KRW"]).default("USD"),
  thesis: z.string().trim().max(4000).default(""),
  invalidation: z.string().trim().max(3000).default(""),
  notes: z.string().trim().max(4000).default(""),
  enabled: z.boolean().default(true),
  position: z.coerce.number().int().min(0).max(999).default(0),
});

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "입력값을 확인하세요.";
  return error instanceof Error ? error.message : "포트폴리오 요청을 처리하지 못했습니다.";
}

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  try {
    return NextResponse.json(await getPortfolioItems(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  try {
    const item = itemSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });
    const row = {
      ticker: item.ticker,
      company_name: item.companyName || null,
      kind: item.kind,
      quantity: item.kind === "holding" ? item.quantity : 0,
      average_cost: item.kind === "holding" ? item.averageCost : null,
      target_weight: item.targetWeight,
      sector: item.sector || null,
      currency: item.currency,
      thesis: item.thesis || null,
      invalidation: item.invalidation || null,
      notes: item.notes || null,
      enabled: item.enabled,
      position: item.position,
      updated_at: new Date().toISOString(),
    };
    if (item.id) {
      const { error } = await supabase.from("portfolio_items").update(row).eq("id", item.id);
      if (error) throw new Error(error.code === "23505" ? "이미 등록된 티커입니다." : error.message);
    } else {
      const { count, error: countError } = await supabase.from("portfolio_items").select("id", { count: "exact", head: true });
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) >= 50) return NextResponse.json({ error: "관심종목과 보유종목은 합계 50개까지 저장할 수 있습니다." }, { status: 400 });
      const { error } = await supabase.from("portfolio_items").insert(row);
      if (error) throw new Error(error.code === "23505" ? "이미 등록된 티커입니다." : error.message);
    }
    return NextResponse.json(await getPortfolioItems());
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginPost(request)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });
    const { error } = await supabase.from("portfolio_items").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(await getPortfolioItems());
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
