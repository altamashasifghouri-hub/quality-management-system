import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("public_pin_hash").eq("id", 1).maybeSingle();
  return NextResponse.json({ enabled: !!data?.public_pin_hash });
}
