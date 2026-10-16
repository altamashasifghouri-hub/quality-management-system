import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

function hashPin(pin: string) {
  const salt = process.env.PUBLIC_PIN_SALT || "qms-public-pin-salt";
  return crypto.pbkdf2Sync(pin, salt, 100000, 32, "sha256").toString("hex");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  try {
    const body = await req.json();
    const pin = String(body.pin || "").trim();
    const { data } = await supabase.from("settings").select("public_pin_hash").eq("id", 1).maybeSingle();
    if (!data?.public_pin_hash) return NextResponse.json({ ok: true });
    if (hashPin(pin) === data.public_pin_hash) {
      const res = NextResponse.json({ ok: true });
      res.cookies.set("qms_public_pin", pin, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
      return res;
    }
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
