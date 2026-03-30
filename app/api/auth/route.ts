import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = await request.json();
  const correct = process.env.DASHBOARD_PASSWORD;

  if (!correct) {
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  if (password !== correct) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("bd_auth", correct, {
    httpOnly: true,
    sameSite: "lax",
    // Secure in production, not required in dev
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return response;
}
