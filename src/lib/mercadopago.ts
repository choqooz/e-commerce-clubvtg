import "server-only";
import { MercadoPagoConfig } from "mercadopago";

const accessToken = process.env.MP_ACCESS_TOKEN;
if (!accessToken) {
  throw new Error("Missing required env var: MP_ACCESS_TOKEN");
}

export const mpClient = new MercadoPagoConfig({
  accessToken,
  options: { timeout: 10000 },
});
