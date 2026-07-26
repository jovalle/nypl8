import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backendUrl = new URL("/api/check", process.env.DMV_BACKEND_URL ?? "http://127.0.0.1:8080");

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 4_096) {
      return NextResponse.json(
        {
          plate: "",
          status: "error",
          message: "Request body is too large.",
          checkedAt: new Date().toISOString(),
        },
        { status: 413, headers: { "cache-control": "no-store" } },
      );
    }

    const payload = (await request.json()) as { plate?: unknown };
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
      // The local native service does not need the edge-only Turnstile token.
      body: JSON.stringify({ plate: payload.plate }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "cache-control": "no-store",
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        ...(response.headers.has("retry-after")
          ? { "retry-after": response.headers.get("retry-after") ?? "5" }
          : {}),
      },
    });
  } catch {
    return NextResponse.json(
      {
        plate: "",
        status: "error",
        message: "The lookup service is unavailable. Try again in a moment.",
        checkedAt: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { "cache-control": "no-store", "retry-after": "5" },
      },
    );
  }
}
