/**
 * Cognito DefineAuthChallenge trigger — orchestrates the passwordless flow.
 * Issues a single CUSTOM_CHALLENGE (the OTP), grants tokens when answered
 * correctly, and fails after 3 wrong answers.
 */
export async function handler(event) {
  const session = event.request.session || [];
  const last = session[session.length - 1];

  if (session.length === 0) {
    // Fresh login → present the OTP challenge.
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = 'CUSTOM_CHALLENGE';
  } else if (last.challengeName === 'CUSTOM_CHALLENGE' && last.challengeResult === true) {
    // Correct code → issue JWTs.
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
  } else if (session.length >= 3) {
    // Too many wrong attempts → stop.
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
  } else {
    // Wrong answer, attempts remaining → present the challenge again.
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = 'CUSTOM_CHALLENGE';
  }

  return event;
}
