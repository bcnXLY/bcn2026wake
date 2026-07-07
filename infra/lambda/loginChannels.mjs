import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { json, attr, maskEmail, maskPhone } from './util.mjs';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID;

/**
 * GET /login/channels?id=BCN-001
 * Returns the OTP delivery options (email / sms) with masked destinations so the
 * client can render the channel picker before starting the passwordless login.
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
