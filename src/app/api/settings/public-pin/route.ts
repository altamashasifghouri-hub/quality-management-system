import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

function hashPin(pin: string) {
  const salt = process.env.PUBLIC_PIN_SALT || "qms-public-pin-salt";
  return crypto.pbkdf2Sync(pin, salt, 100000, 32, "sha256").toString("hex");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const pin = String(body.pin || "").trim();
    const action = String(body.action || "set");

    if (action === "clear") {
      await supabase.from("settings").upsert({ id: 1, public_pin_hash: null, updated_at: new Date().toISOString() }, { onConflict: "id" });
      return NextResponse.json({ ok: true });
    }

    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 4-6 digits" }, { status: 400 });
    }

    const public_pin_hash = hashPin(pin);
    await supabase.from("settings").upsert({ id: 1, public_pin_hash, updated_at: new Date().toISOString() }, { onConflict: "id" });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
