import { NextRequest, NextResponse } from "next/server";

// Ignora o parsing de body do Next.js para o webhook
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/stripe/webhook") {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/stripe/webhook"],
};
