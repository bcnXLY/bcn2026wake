import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { generateOtp } from './util.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});
const sns = new SNSClient({});

const OTP_TABLE = process.env.OTP_TABLE;
const OTP_TTL = Number(process.env.OTP_TTL_SECONDS || '600');
const RESEND_COOLDOWN = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60');
const SES_FROM = process.env.SES_FROM_ADDRESS;

/**
 * Cognito CreateAuthChallenge trigger — sends the OTP on a fresh challenge and
 * reuses the same code on retry rounds (so wrong answers don't re-send SMS).
 * A per-user cooldown throttles fresh sends to prevent OTP flooding / SMS abuse;
 * exceeding it throws, which the client surfaces as a countdown.
 */
export async function handler(event) {
  const session = event.request.session || [];
  // Recover a previously-issued code from an earlier round, if any.
  const prior = [...session].reverse().find(
    (s) => typeof s.challengeMetadata === 'string' && s.challengeMetadata.startsWith('CODE-'),
  );

  let code;
  if (prior) {
    code = prior.challengeMetadata.slice(5);
  } else {
    // Fresh OTP: enforce cooldown, then dispatch.
    const username = event.userName;
    const now = Math.floor(Date.now() / 1000);
    const rec = await ddb.send(new GetCommand({ TableName: OTP_TABLE, Key: { id: username } }));
    const lastSentAt = rec.Item?.lastSentAt ?? 0;
    if (now - lastSentAt < RESEND_COOLDOWN) {
      throw new Error(`COOLDOWN:${RESEND_COOLDOWN - (now - lastSentAt)}`);
    }

    code = generateOtp();
    await ddb.send(
      new PutCommand({
        TableName: OTP_TABLE,
        Item: { id: username, lastSentAt: now, expiresAt: now + OTP_TTL },
      }),
    );

    const attrs = event.request.userAttributes || {};
    const email = attrs.email;
    const phone = attrs.phone_number;
    const channel = event.request.clientMetadata?.channel === 'sms' ? 'sms' : 'email';
    const text = `Your BCN 2026 verification code is ${code}. It expires in ${Math.round(
      OTP_TTL / 60,
    )} minutes.`;

    if (channel === 'sms' && phone) {
      await sns.send(
        new PublishCommand({
          PhoneNumber: phone,
          Message: text,
          MessageAttributes: {
            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
          },
        }),
      );
    } else if (email) {
      await ses.send(
        new SendEmailCommand({
          Source: SES_FROM,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: 'BCN 2026 — Your verification code' },
            Body: { Text: { Data: text } },
          },
        }),
      );
    } else if (phone) {
      await sns.send(
        new PublishCommand({
          PhoneNumber: phone,
          Message: text,
          MessageAttributes: {
            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
          },
        }),
      );
    } else {
      throw new Error('No contact channel on file');
    }
  }

  // Never expose the code publicly; keep it in the private params for verify.
  event.response.publicChallengeParameters = {
    channel: event.request.clientMetadata?.channel === 'sms' ? 'sms' : 'email',
  };
  event.response.privateChallengeParameters = { code };
  event.response.challengeMetadata = `CODE-${code}`;

  return event;
}
