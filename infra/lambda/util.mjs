import { randomInt } from 'node:crypto';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
};

/** Standard JSON API Gateway proxy response with CORS headers. */
export function json(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

/** Reads a Cognito user attribute by name, or returns undefined. */
export function attr(user, name) {
  const found = (user.UserAttributes || user.Attributes || []).find((a) => a.Name === name);
  return found?.Value;
}

/** Cryptographically-uniform 6-digit numeric OTP (avoids Math.random bias). */
export function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Masks an email for safe display, e.g. "a***@example.com". */
export function maskEmail(email) {
  if (!email) return undefined;
  const [user, domain] = email.split('@');
  if (!domain) return undefined;
  const head = user.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(user.length - 1, 1))}@${domain}`;
}

/** Masks a phone number, keeping the last 2 digits, e.g. "•••••••89". */
export function maskPhone(phone) {
  if (!phone) return undefined;
  const tail = phone.slice(-2);
  return `${'•'.repeat(Math.max(phone.length - 2, 2))}${tail}`;
}
