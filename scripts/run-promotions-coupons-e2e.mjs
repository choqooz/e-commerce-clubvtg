import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const FIXTURE_PATH = path.join(ROOT, "playwright/.promotions-coupons-fixture.json");
const E2E_BASE_URL = "http://localhost:4173";
const CLERK_ENV_PATH = path.resolve(ROOT, "..", "..", "e-commerce-clubvtg", ".env.local");
const CLERK_ENVIRONMENT_VARIABLES = new Set([
  "ADMIN_EMAIL",
  "CLERK_SECRET_KEY",
  "E2E_CLERK_USER_EMAIL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
]);

function safeDiagnostics(output, environment) {
  let redacted = output.replace(/\b[^\s@]+@[^\s@]+\b/g, "[redacted-email]");
  for (const value of [...Object.values(process.env), ...Object.values(environment ?? {})]) {
    if (typeof value === "string" && value.length > 3) redacted = redacted.split(value).join("[redacted]");
  }
  return redacted.slice(-12_000);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { diagnostics = false, ...spawnOptions } = options;
    const child = spawn(command, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], ...spawnOptions });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", (error) => reject(new Error(`${command} is unavailable: ${error.message}`)));
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(`${command} ${args.join(" ")} failed with exit ${code}${diagnostics ? `\n${safeDiagnostics(output, spawnOptions.env)}` : ""}`)));
  });
}

function isLocalUrl(value) {
  return /^http:\/\/(127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/.test(value ?? "");
}

function parseEnvironmentValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\s+#.*$/, "");
}

async function loadClerkDevelopmentEnvironment() {
  const source = await readFile(CLERK_ENV_PATH, "utf8");
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (!match || !CLERK_ENVIRONMENT_VARIABLES.has(match[1])) continue;
    values[match[1]] = parseEnvironmentValue(match[2]);
  }
  const missing = [...CLERK_ENVIRONMENT_VARIABLES].filter((name) => !values[name]);
  if (missing.length > 0) throw new Error(`Authorized Clerk development source is missing: ${missing.join(", ")}`);
  return {
    CLERK_SECRET_KEY: values.CLERK_SECRET_KEY,
    E2E_CLERK_ADMIN_EMAIL: values.ADMIN_EMAIL,
    E2E_CLERK_USER_EMAIL: values.E2E_CLERK_USER_EMAIL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: values.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  };
}

function localRuntimeEnvironment(clerk, runtime) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (/^(?:NEXT_PUBLIC_)?SUPABASE_/.test(name)) delete environment[name];
  }
  return {
    ...environment,
    ...clerk,
    COUPON_IDENTITY_HMAC_KEY_V1: randomBytes(32).toString("hex"),
    E2E_LOCAL_PAYMENT_HANDOFF: "true",
    MP_ACCESS_TOKEN: "TEST-local-e2e-mock-only",
    NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: runtime.anonKey,
    NEXT_PUBLIC_SUPABASE_URL: runtime.url,
    SUPABASE_SERVICE_ROLE_KEY: runtime.serviceRoleKey,
  };
}

function supabase(args, options) {
  return run("npx", ["--yes", "supabase", ...args], options);
}

function parseStatusEnvironment(output) {
  const values = Object.fromEntries(output.split("\n").flatMap((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    return match ? [[match[1], parseEnvironmentValue(match[2])]] : [];
  }));
  const pick = (...names) => names.map((name) => values[name]).find(Boolean);
  const runtime = {
    anonKey: pick("ANON_KEY", "SUPABASE_ANON_KEY", "SUPA_ANON_KEY"),
    serviceRoleKey: pick("SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPA_SERVICE_KEY"),
    url: pick("API_URL", "SUPABASE_URL", "SUPA_API_URL"),
  };
  if (!runtime.anonKey || !runtime.serviceRoleKey || !isLocalUrl(runtime.url)) {
    throw new Error("Local Supabase status did not provide local API, anon, and service-role values.");
  }
  return runtime;
}

async function resolveClerkUser(secretKey, email, role) {
  const response = await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`, {
    headers: { authorization: `Bearer ${secretKey}` },
  });
  if (!response.ok) throw new Error(`Clerk development ${role} lookup failed (${response.status}).`);
  const users = await response.json();
  const matches = users.filter((user) => user.email_addresses?.some((address) => address.email_address.toLowerCase() === email.toLowerCase()));
  if (matches.length !== 1) throw new Error(`Expected exactly one dedicated Clerk development ${role} user.`);
  const primary = matches[0].email_addresses?.find((address) => address.id === matches[0].primary_email_address_id);
  if (!primary?.email_address) throw new Error(`Dedicated Clerk development ${role} user has no primary email.`);
  return { email: primary.email_address, id: matches[0].id };
}

async function request(runtime, resource, body, method = "POST", prefer = "return=representation") {
  const response = await fetch(`${runtime.url}/rest/v1/${resource}`, {
    method,
    headers: {
      apikey: runtime.serviceRoleKey,
      authorization: `Bearer ${runtime.serviceRoleKey}`,
      "content-type": "application/json",
      prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Local Supabase fixture ${method} ${resource} failed (${response.status}).`);
  if (response.status === 204) return null;
  const payload = await response.text();
  return payload ? JSON.parse(payload) : null;
}

async function insert(runtime, table, row) {
  const rows = await request(runtime, table, row);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`Local Supabase fixture insert did not return one ${table} row.`);
  return rows[0];
}

async function rpc(runtime, name, payload) {
  const value = await request(runtime, `rpc/${name}`, payload);
  return Array.isArray(value) ? value[0] : value;
}

async function provisionFixture(runtime, customer, admin) {
  const nonce = randomUUID().replaceAll("-", "");
  const now = new Date();
  const startsAt = new Date(now.getTime() - 60_000).toISOString();
  const endsAt = new Date(now.getTime() + 86_400_000).toISOString();
  const customerEmail = customer.email;
  const adminEmail = admin.email;
  await request(runtime, "profiles?on_conflict=id", [
    { id: customer.id, email: customerEmail, full_name: "E2E Customer", is_admin: false },
    { id: admin.id, email: adminEmail, full_name: "E2E Administrator", is_admin: true },
  ], "POST", "resolution=merge-duplicates,return=minimal");

  const type = await insert(runtime, "product_types", { name: `E2E Type ${nonce}` });
  const subtype = await insert(runtime, "product_subtypes", { name: `E2E Subtype ${nonce}`, product_type_id: type.id });
  const product = await insert(runtime, "products", {
    category: "e2e-fixture",
    color: "negro",
    description: "Disposable local E2E product.",
    image_urls: [],
    price: 10000,
    product_subtype_id: subtype.id,
    product_type_id: type.id,
    size: "M",
    slug: `e2e-fixture-${nonce}`,
    status: "available",
    subcategory: "e2e-fixture",
    title: `E2E Product ${nonce}`,
  });
  const historyProduct = await insert(runtime, "products", {
    category: "e2e-history",
    color: "negro",
    description: "Mutable catalog value intentionally conflicts with the order snapshot.",
    image_urls: [],
    price: 1,
    product_subtype_id: subtype.id,
    product_type_id: type.id,
    size: "M",
    slug: `e2e-history-${nonce}`,
    status: "available",
    subcategory: "e2e-history",
    title: `E2E History Product ${nonce}`,
  });
  const promotionId = await rpc(runtime, "create_promotion", {
    p_actor: admin.id,
    p_discount_bps: 1000,
    p_ends_at: endsAt,
    p_starts_at: startsAt,
    p_targets: [{ product_subtype_id: subtype.id, product_type_id: type.id }],
  });
  const couponCode = `E2E-${nonce.slice(0, 24).toUpperCase()}`;
  await rpc(runtime, "create_coupon", {
    p_actor: admin.id,
    p_capacity: 10,
    p_code: couponCode,
    p_discount_bps: 2000,
    p_ends_at: endsAt,
    p_fixed_discount_cents: null,
    p_starts_at: startsAt,
  });
  const promotionVersions = await request(runtime, `promotion_versions?promotion_id=eq.${promotionId}&version_number=eq.1&select=id`, undefined, "GET");
  if (!Array.isArray(promotionVersions) || promotionVersions.length !== 1) throw new Error("Local Supabase promotion version fixture was not created.");
  const historyOrder = await insert(runtime, "orders", {
    coupon_reservation_state: "none",
    customer_email: customerEmail,
    customer_name: "E2E Customer",
    integrity_version: 1,
    merchandise_discount_cents: 100000,
    merchandise_final_cents: 900000,
    merchandise_original_cents: 1000000,
    payment_amount: 14000,
    payment_amount_cents: 1400000,
    payment_currency: "ARS",
    payment_expires_at: endsAt,
    payment_reference: `e2e-history:${nonce}`,
    pricing_snapshot_at: now.toISOString(),
    pricing_source: "promotions",
    promotion_ids: [promotionId],
    purchase_user_id: customer.id,
    shipping_cents: 500000,
    shipping_fee: 5000,
    shipping_info: { city: "CABA", email: customerEmail, fullName: "E2E Customer" },
    status: "paid",
    total_amount: 14000,
    total_cents: 1400000,
    user_id: customer.id,
  });
  await insert(runtime, "order_items", {
    discount_bps: 1000,
    discount_cents: 100000,
    final_cents: 900000,
    integrity_version: 1,
    order_id: historyOrder.id,
    original_cents: 1000000,
    price: 9000,
    pricing_source: "promotions",
    product_id: historyProduct.id,
    product_title_snapshot: `Historical E2E Product ${nonce}`,
    promotion_id: promotionId,
    promotion_version_id: promotionVersions[0].id,
  });
  return { couponCode, customerEmail, historyOrderId: historyOrder.id, historyTotalCents: 1400000, productSlug: product.slug, promotionPercent: 10 };
}

async function main() {
  if (process.env.E2E_LOCAL_SUPABASE !== "true" || process.env.E2E_RESET_LOCAL_SUPABASE !== "true") {
    throw new Error("E2E_LOCAL_SUPABASE=true and E2E_RESET_LOCAL_SUPABASE=true are required for the disposable local stack.");
  }
  const clerk = await loadClerkDevelopmentEnvironment();
  const publishableKey = clerk.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = clerk.CLERK_SECRET_KEY;
  if (!publishableKey.startsWith("pk_test_") || !secretKey.startsWith("sk_test_")) throw new Error("Promotions/coupons E2E only accepts Clerk development keys.");
  const customerEmail = clerk.E2E_CLERK_USER_EMAIL;
  const adminEmail = clerk.E2E_CLERK_ADMIN_EMAIL;
  const [customer, admin] = await Promise.all([resolveClerkUser(secretKey, customerEmail, "customer"), resolveClerkUser(secretKey, adminEmail, "administrator")]);
  if (customer.id === admin.id) throw new Error("Dedicated Clerk customer and administrator users must be distinct.");

  let ownsStack = false;
  try {
    try {
      await supabase(["status", "--output", "env"]);
      throw new Error("A local Supabase stack is already running; refusing to reset a non-disposable stack.");
    } catch (error) {
      if (error.message.includes("already running")) throw error;
    }
    await supabase(["start"]);
    ownsStack = true;
    await supabase(["db", "reset", "--local"]);
    const runtime = parseStatusEnvironment(await supabase(["status", "--output", "env"]));
    const fixture = await provisionFixture(runtime, customer, admin);
    await mkdir(path.dirname(FIXTURE_PATH), { recursive: true });
    await writeFile(FIXTURE_PATH, `${JSON.stringify(fixture)}\n`, "utf8");
    await run("npx", ["playwright", "test", "--config=playwright.promotions-coupons.config.ts"], {
      diagnostics: true,
      env: localRuntimeEnvironment(clerk, runtime),
    });
  } finally {
    await Promise.all([
      rm(FIXTURE_PATH, { force: true }),
      rm(path.join(ROOT, "playwright/.clerk/user.json"), { force: true }),
      rm(path.join(ROOT, "playwright/.clerk/promotions-coupons-admin.json"), { force: true }),
    ]);
    if (ownsStack) {
      await supabase(["db", "reset", "--local"]);
      await supabase(["stop", "--no-backup"]);
    }
  }
}

main().catch((error) => {
  console.error(`Promotions/coupons E2E blocked: ${error.message}`);
  process.exitCode = 1;
});
