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
