/**
 * Bulk pre-provision attendees into the Cognito user pool from a CSV roster.
 *
 *   AWS_REGION=us-east-1 COGNITO_USER_POOL_ID=us-east-1_xxx \
 *   node seedUsers.mjs ./roster.csv
 *
 * Each user is created with:
 *   - a suppressed welcome message (no Cognito default email/SMS),
 *   - verified email + phone so the OTP can be delivered,
 *   - custom:activated = "false" (flipped to "true" on first login),
 *   - a random temporary password (never used; replaced via the OTP flow).
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

const REGION = process.env.AWS_REGION;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const csvPath = process.argv[2] || './roster.csv';

if (!REGION || !USER_POOL_ID) {
  console.error('Set AWS_REGION and COGNITO_USER_POOL_ID env vars.');
  process.exit(1);
}

const cognito = new CognitoIdentityProviderClient({ region: REGION });

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

async function upsert({ id, name, email, phone, team_name, links }) {
  const attributes = [
    { Name: 'name', Value: name },
    { Name: 'email', Value: email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'phone_number', Value: phone },
    { Name: 'phone_number_verified', Value: 'true' },
    { Name: 'custom:team_name', Value: team_name },
    { Name: 'custom:links', Value: links || '[]' },
    { Name: 'custom:activated', Value: 'false' },
  ];

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
    // Move the user out of FORCE_CHANGE_PASSWORD with a random permanent temp;
    // the real password is set later through the OTP flow.
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
          // Do not reset custom:activated for existing (possibly active) users.
          UserAttributes: attributes.filter((a) => a.Name !== 'custom:activated'),
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
      result === 'created' ? created++ : updated++;
      console.log(`  ${result.padEnd(7)} ${record.id}  (${record.name})`);
    } catch (err) {
      console.error(`  FAILED  ${record.id}: ${err.name} — ${err.message}`);
    }
  }

  console.log(`\nDone. Created ${created}, updated ${updated}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
