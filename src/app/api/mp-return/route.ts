import { NextResponse } from "next/server";

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  throw new Error(
    "NEXT_PUBLIC_APP_URL env var is required in production. Set it in your .env file."
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  
  // MP appends query parameters: collection_id, collection_status, external_reference, etc.
  const orderId = url.searchParams.get("order_id") || url.searchParams.get("external_reference") || "";
  
  // Validate status to prevent open redirect
  const rawStatus = url.searchParams.get("status") || "success";
  const allowedStatuses = ["success", "failure", "pending"] as const;
  const status = allowedStatuses.includes(rawStatus as typeof allowedStatuses[number])
    ? rawStatus
    : "success";
  
  const baseUrl = getBaseUrl();
  const redirectUrl = `${baseUrl}/checkout/${status}?order_id=${encodeURIComponent(orderId)}`;
  
  return NextResponse.redirect(redirectUrl);
}
