/**
 * Bulk pre-provision attendees into the Cognito user pool from a CSV roster.
 *
 *   AWS_REGION=eu-west-3 COGNITO_USER_POOL_ID=eu-west-3_xxx \
 *   ATTENDEES_TABLE=bcn2026-attendees \
 *   node seedUsers.mjs ./roster.csv
 *
 * Each user is created with:
 *   - a suppressed welcome message (no Cognito default email/SMS),
 *   - verified email + phone so the OTP can be delivered,
 *   - a random permanent password so the account is CONFIRMED for passwordless
 *     CUSTOM_AUTH login (the password is never used).
 *
 * When ATTENDEES_TABLE is set, each attendee is also mirrored into DynamoDB
 * (native lists/booleans) so you can query by team / room / church.
 *
 * The script is idempotent: existing users are updated, not duplicated.
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminSetUserPasswordCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
// Optional: when set, each attendee is also mirrored into the DynamoDB roster
// so you can query by team / room / church.
const ATTENDEES_TABLE = process.env.ATTENDEES_TABLE;
const csvPath = process.argv[2] || './roster.csv';

if (!REGION || !USER_POOL_ID) {
  console.error('Set AWS_REGION and COGNITO_USER_POOL_ID env vars.');
  process.exit(1);
}

const cognito = new CognitoIdentityProviderClient({ region: REGION });
const ddb = ATTENDEES_TABLE
  ? DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
      marshallOptions: { removeUndefinedValues: true },
    })
  : null;

/** Minimal RFC-4180-ish CSV parser (handles quoted fields + escaped quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      }
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function tempPassword() {
  // Meets the pool policy (letters + digit, >= 8) and is thrown away immediately.
  return `Tmp-${randomBytes(9).toString('base64url')}9`;
}

/** "BCN-002;BCN-003" or "BCN-002,BCN-003" -> '["BCN-002","BCN-003"]' (JSON string). */
function toJsonList(value) {
  const items = (value || '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return JSON.stringify(items);
}

/** Normalises truthy CSV values (true/1/yes/y) to the string "true"/"false". */
function toBool(value) {
  return /^(true|1|yes|y)$/i.test((value || '').trim()) ? 'true' : 'false';
}

/** Mirrors an attendee into DynamoDB with native lists/booleans for querying. */
async function putRoster(r) {
  if (!ddb) return;
  const toList = (v) =>
    (v || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  const item = {
    id: r.id,
    name: r.name,
    email: r.email || undefined,
    phone: r.phone || undefined,
    church_name: r.church_name || undefined,
    team_code: r.team_code || undefined,
    team_name: r.team_name || undefined,
    room_number: r.room_number || undefined,
    leaders_id: toList(r.leaders_id),
    roommates_id: toList(r.roommates_id),
    is_leader: toBool(r.is_leader) === 'true',
    is_maintainer: toBool(r.is_maintainer) === 'true',
  };
  await ddb.send(new PutCommand({ TableName: ATTENDEES_TABLE, Item: item }));
}

async function upsert(r) {
  const attributes = [
    { Name: 'name', Value: r.name },
    { Name: 'custom:church_name', Value: r.church_name || '' },
    { Name: 'custom:team_code', Value: r.team_code || '' },
    { Name: 'custom:team_name', Value: r.team_name || '' },
    { Name: 'custom:room_number', Value: r.room_number || '' },
    { Name: 'custom:leaders_id', Value: toJsonList(r.leaders_id) },
    { Name: 'custom:roommates_id', Value: toJsonList(r.roommates_id) },
    { Name: 'custom:is_leader', Value: toBool(r.is_leader) },
    { Name: 'custom:is_maintainer', Value: toBool(r.is_maintainer) },
  ];
  // Only set contact attributes that exist, and mark them verified so the OTP
  // can be delivered on that channel.
  if (r.email) {
    attributes.push({ Name: 'email', Value: r.email });
    attributes.push({ Name: 'email_verified', Value: 'true' });
  }
  if (r.phone) {
    attributes.push({ Name: 'phone_number', Value: r.phone });
    attributes.push({ Name: 'phone_number_verified', Value: 'true' });
  }

  const id = r.id;

  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: id,
        MessageAction: 'SUPPRESS',
        TemporaryPassword: tempPassword(),
        UserAttributes: attributes,
      }),
    );
    // Set a random permanent password so the account is CONFIRMED (required for
    // the passwordless CUSTOM_AUTH flow); the password itself is never used.
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: id,
        Password: tempPassword(),
        Permanent: true,
      }),
    );
    return 'created';
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      await cognito.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: USER_POOL_ID,
          Username: id,
          UserAttributes: attributes,
        }),
      );
      return 'updated';
    }
    throw err;
  }
}

async function main() {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const header = rows.shift().map((h) => h.trim());
  let created = 0;
  let updated = 0;

  for (const cols of rows) {
    const record = Object.fromEntries(header.map((h, i) => [h, (cols[i] ?? '').trim()]));
    if (!record.id) continue;
    try {
      const result = await upsert(record);
      await putRoster(record);
      result === 'created' ? created++ : updated++;
      console.log(`  ${result.padEnd(7)} ${record.id}  (${record.name})`);
    } catch (err) {
      console.error(`  FAILED  ${record.id}: ${err.name} — ${err.message}`);
    }
  }

  console.log(
    `\nDone. Created ${created}, updated ${updated}.` +
      (ddb ? ` Mirrored to ${ATTENDEES_TABLE}.` : ' (DynamoDB mirror skipped — set ATTENDEES_TABLE.)'),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
