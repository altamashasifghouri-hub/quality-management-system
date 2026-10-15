import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTodayAudits, localDateString } from "@/lib/today";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || localDateString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ date, items: [] });
  }

  const supabase = await createClient();
  const items = await getTodayAudits(supabase, date);
  return NextResponse.json({ date, items });
}
