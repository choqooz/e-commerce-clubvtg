import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { CART_CLEAR_PROOF_COOKIE, CART_CLEAR_PROOF_PATH, isCartClearProofForOrder } from "@/lib/payments/cart-clear-proof";
import { getOwnedProductReturnOrder, isAuthoritativelyPaidProductReturn, isOrderId } from "@/lib/payments/return-authority";
import { getTrustedPublicOrigin, hasTrustedPublicOrigin } from "@/lib/payments/trusted-public-origin";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function reject(status: 400 | 401 | 403 | 404) {
  return NextResponse.json({ error: "Invalid cart-clear proof" }, { headers: NO_STORE_HEADERS, status });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return reject(401);

  const trustedOrigin = getTrustedPublicOrigin();
  if (!trustedOrigin || !hasTrustedPublicOrigin(request.headers.get("origin"))) return reject(403);

  let orderId: string | null;
  try {
    const formData = await request.formData();
    const value = formData.get("order_id");
    orderId = typeof value === "string" ? value : null;
  } catch {
    return reject(400);
  }
  if (!isOrderId(orderId)) return reject(400);

  const proof = request.cookies.get(CART_CLEAR_PROOF_COOKIE)?.value;
  if (!isCartClearProofForOrder(proof, orderId)) return reject(403);

  const order = await getOwnedProductReturnOrder(orderId, userId);
  if (!order) return reject(404);
  if (!isAuthoritativelyPaidProductReturn(order)) return reject(403);

  const response = NextResponse.json({ consumed: true }, { headers: NO_STORE_HEADERS });
  response.cookies.set(CART_CLEAR_PROOF_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: CART_CLEAR_PROOF_PATH,
    sameSite: "lax",
    secure: trustedOrigin.startsWith("https://"),
  });
  return response;
}
