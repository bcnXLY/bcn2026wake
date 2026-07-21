import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { json, attr, maskEmail, maskPhone } from './util.mjs';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID;

/**
 * GET /login/channels?id=BCN-001
 * Returns the attendee profile after confirming the supplied ID exists in the
 * Cognito roster. OTP channel details are kept for the eventual restoration of
 * the passwordless login flow.
 * 404 if the ID is not on the roster.
 */
export async function handler(event) {
  const id = event.queryStringParameters?.id?.trim();
  if (!id) return json(400, { message: 'Missing id' });

  try {
    const user = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: id }),
    );
    const email = attr(user, 'email');
    const phone = attr(user, 'phone_number');
    return json(200, {
      profile: {
        id,
        name: attr(user, 'name') || '',
        email: email || '',
        phone: phone || '',
        churchName: attr(user, 'custom:church_name') || '',
        teamCode: attr(user, 'custom:team_code') || '',
        teamName: attr(user, 'custom:team_name') || '',
        roomNumber: attr(user, 'custom:room_number') || '',
        leadersId: parseList(attr(user, 'custom:leaders_id')),
        roommatesId: parseList(attr(user, 'custom:roommates_id')),
        isLeader: attr(user, 'custom:is_leader') === 'true',
        isMaintainer: attr(user, 'custom:is_maintainer') === 'true',
      },
      channels: {
        email: email ? { available: true, hint: maskEmail(email) } : { available: false },
        sms: phone ? { available: true, hint: maskPhone(phone) } : { available: false },
      },
    });
  } catch (err) {
    if (err.name === 'UserNotFoundException') return json(404, { message: 'Unknown id' });
    console.error(err);
    return json(500, { message: 'Server error' });
  }
}

function parseList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  }
}
