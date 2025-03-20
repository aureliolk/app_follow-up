// app/middleware.ts (temporário para testes)
import { NextResponse } from "next/server"

export function middleware(request: Request) {
  const response = NextResponse.next()
  response.headers.set("Access-Control-Allow-Origin", "*") // Permite todas as origens (temporário)
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  response.headers.set("Access-Control-Max-Age", "86400")

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: response.headers,
    })
  }

  return response
}

export const config = {
  matcher: "/api/:path*",
}

