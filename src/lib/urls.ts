interface ResolvedUrls {
  siteUrl: string;
  webhookBaseUrl: string;
}

/**
 * Resolve site URL and webhook base URL from environment variables.
 *
 * - siteUrl: For user-facing redirects (back_urls in MercadoPago)
 * - webhookBaseUrl: For MP webhook notifications (uses ngrok tunnel in development)
 */
export function resolvePaymentUrls(): ResolvedUrls {
  const ngrokUrl = (process.env.NEXT_PUBLIC_NGROK_URL || "").trim();
  const envUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

  const rawSiteUrl = envUrl || "http://localhost:3000";
  const siteUrl = rawSiteUrl.endsWith("/")
    ? rawSiteUrl.slice(0, -1)
    : rawSiteUrl;

  const rawWebhookUrl = ngrokUrl || siteUrl;
  const webhookBaseUrl = rawWebhookUrl.endsWith("/")
    ? rawWebhookUrl.slice(0, -1)
    : rawWebhookUrl;

  if (!siteUrl.startsWith("http")) {
    throw new Error(
      `La URL configurada en el .env no es válida: "${siteUrl}"`,
    );
  }

  return { siteUrl, webhookBaseUrl };
}
