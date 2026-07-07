import { timingSafeEqual } from 'node:crypto';

/**
 * Cognito VerifyAuthChallengeResponse trigger — constant-time compares the
 * submitted code with the expected one from the private challenge parameters.
 */
export async function handler(event) {
  const expected = String(event.request.privateChallengeParameters?.code ?? '');
  const provided = String(event.request.challengeAnswer ?? '');

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  event.response.answerCorrect = a.length === b.length && timingSafeEqual(a, b);

  return event;
}
