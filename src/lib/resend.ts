import "server-only";

import { Resend } from "resend";

const EMAIL_ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const NAMED_EMAIL_ADDRESS = /^[^<>\r\n]+ <([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)>$/;

function isValidSender(value: string): boolean {
  const namedAddress = value.match(NAMED_EMAIL_ADDRESS)?.[1];
  return value === value.trim() && (EMAIL_ADDRESS.test(value) || Boolean(namedAddress));
}

export function getResendMailer() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey?.trim() || !from || !isValidSender(from)) {
    throw new Error("Invalid Resend email configuration");
  }

  return { client: new Resend(apiKey), from };
}
