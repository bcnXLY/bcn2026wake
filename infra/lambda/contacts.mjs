import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { json } from './util.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const PARTICIPANTS_TABLE = process.env.ATTENDEES_TABLE;

// Roles are stored as numeric i18n codes on each participant record:
//   0 = 组员 (group member), 1 = 辅导 (group counsellor/leader). Every other code
//   (2 = 同工, 3 = 祷告组, …, 10 = 大会主席) is staff and is treated as a maintainer.
const ROLE_MEMBER = 0;
const ROLE_LEADER = 1;

// Placeholder ids emitted by the uploader when a participant has no real
// team / room assignment yet.
const UNASSIGNED = new Set(['unassigned', 'team_0', 'room_0']);

/**
 * GET /contacts?id=BCN-001
 *
 * Returns a role-based slice of the participant roster. During the temporary
 * ID-only access period, the attendee ID comes from the query string; their role
 * and team are still read from their own DynamoDB record.
 *
 *   member (组员)      → { role, people: [their group leaders] }
 *   leader (辅导)      → { role, people: [their group members] }
 *   maintainer (staff) → { role, groups: [every group], maintainers: [staff roster] }
 */
export async function handler(event) {
  const claims = event.requestContext?.authorizer?.claims;
  const myId = claims?.['cognito:username'] || claims?.sub || event.queryStringParameters?.id?.trim();
  if (!myId) return json(401, { message: 'Unauthorized' });

  try {
    const me = await fetchParticipant(myId);
    if (!me) return json(404, { message: 'Participant not found' });

    const roommates = await fetchRoommates(me);

    let view;
    if (isMaintainer(me)) view = await maintainerView();
    else if (isLeader(me)) view = await leaderView(me);
    else view = await memberView(me);

    return json(200, { ...view, roommates });
  } catch (err) {
    console.error(err);
    return json(500, { message: 'Server error' });
  }
}

function isLeaderRole(role) {
  return role === ROLE_LEADER;
}

function isMaintainerRole(role) {
  return role !== ROLE_MEMBER && role !== ROLE_LEADER;
}

function isLeader(p) {
  return isLeaderRole(p.role);
}

function isMaintainer(p) {
  return isMaintainerRole(p.role);
}

function hasRealTeam(p) {
  return Boolean(p.team_id) && !UNASSIGNED.has(p.team_id);
}

function hasRealRoom(p) {
  return Boolean(p.room_id) && !UNASSIGNED.has(p.room_id);
}

/** "team_1" -> "Team 1", "room_12" -> "Room 12" (fallback: the raw id). */
function label(id) {
  if (!id) return '';
  const [prefix, ...rest] = id.split('_');
  const suffix = rest.join('_');
  if (!suffix) return id;
  return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} ${suffix}`;
}

/** Maps a raw DynamoDB participant item to the public person shape (no birthday). */
function toPerson(item) {
  return {
    id: item.id,
    name: item.name || '',
    phone: item.phone != null && item.phone !== 0 ? String(item.phone) : '',
    roomNumber: hasRealRoom(item) ? label(item.room_id) : undefined,
    role: typeof item.role === 'number' ? item.role : Number(item.role) || 0,
    isLeader: isLeaderRole(item.role),
    isMaintainer: isMaintainerRole(item.role),
  };
}

function byName(a, b) {
  return (a.name || '').localeCompare(b.name || '');
}

/** Loads a single participant by id. */
async function fetchParticipant(id) {
  const res = await ddb.send(
    new GetCommand({ TableName: PARTICIPANTS_TABLE, Key: { id } }),
  );
  return res.Item || null;
}

/** Everyone sharing the caller's room (excluding self; skipped if unassigned). */
async function fetchRoommates(me) {
  if (!hasRealRoom(me)) return [];
  const items = await queryIndex('byRoom', 'room_id', me.room_id);
  return items
    .filter((item) => item.id !== me.id)
    .map(toPerson)
    .sort(byName);
}

/** Members see the phone numbers of their group's leaders (辅导). */
async function memberView(me) {
  if (!hasRealTeam(me)) return { role: 'member', people: [] };
  const items = await queryIndex('byTeam', 'team_id', me.team_id);
  const people = items
    .filter((item) => isLeaderRole(item.role))
    .map(toPerson)
    .sort(byName);
  return { role: 'member', people };
}

/** Leaders see every member of their own group (excluding themselves). */
async function leaderView(me) {
  if (!hasRealTeam(me)) return { role: 'leader', people: [] };
  const items = await queryIndex('byTeam', 'team_id', me.team_id);
  const people = items
    .filter((item) => item.id !== me.id && item.role === ROLE_MEMBER)
    .map(toPerson)
    .sort(byName);
  return { role: 'leader', people };
}

/** Maintainers see every group plus the staff roster. */
async function maintainerView() {
  const items = await scanAll();

  const groups = new Map();
  for (const item of items) {
    if (!hasRealTeam(item)) continue;
    const code = item.team_id;
    if (!groups.has(code)) {
      groups.set(code, { teamCode: code, teamName: label(code), members: [] });
    }
    groups.get(code).members.push(toPerson(item));
  }

  const groupList = [...groups.values()]
    .map((g) => ({ ...g, members: g.members.sort(byName) }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName, undefined, { numeric: true }));

  const maintainers = items
    .filter((item) => isMaintainerRole(item.role))
    .map((item) => ({
      ...toPerson(item),
      teamCode: hasRealTeam(item) ? item.team_id : undefined,
      teamName: hasRealTeam(item) ? label(item.team_id) : undefined,
    }))
    .sort(byName);

  return { role: 'maintainer', groups: groupList, maintainers };
}

/** Query a single-hash-key GSI, following pagination. */
async function queryIndex(indexName, keyName, value) {
  if (!value) return [];
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: PARTICIPANTS_TABLE,
        IndexName: indexName,
        KeyConditionExpression: '#k = :v',
        ExpressionAttributeNames: { '#k': keyName },
        ExpressionAttributeValues: { ':v': value },
        ExclusiveStartKey,
      }),
    );
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/** Full-table scan (roster is ~400-500 items — well within a single Lambda). */
async function scanAll() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new ScanCommand({ TableName: PARTICIPANTS_TABLE, ExclusiveStartKey }),
    );
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}
