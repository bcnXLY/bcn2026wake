import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { json } from './util.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const PARTICIPANTS_TABLE = process.env.ATTENDEES_TABLE;

const ROLE_MEMBER = 0;
const ROLE_LEADER = 1;
const ROLE_MAINTAINER = 8;

const UNASSIGNED = new Set(['unassigned', 'team_0', 'room_0']);

export async function handler(event) {
  const id = event.queryStringParameters?.id?.trim();
  if (!id) return json(400, { message: 'Missing id' });

  try {
    const res = await ddb.send(
      new GetCommand({ TableName: PARTICIPANTS_TABLE, Key: { id } }),
    );
    const p = res.Item;
    if (!p) return json(404, { message: 'Unknown id' });

    return json(200, { profile: toProfile(p) });
  } catch (err) {
    console.error(err);
    return json(500, { message: 'Server error' });
  }
}

function hasRealTeam(p) {
  return Boolean(p.team_id) && !UNASSIGNED.has(p.team_id);
}

function hasRealRoom(p) {
  return Boolean(p.room_id) && !UNASSIGNED.has(p.room_id);
}

function label(id) {
  if (!id) return '';
  const [prefix, ...rest] = id.split('_');
  const suffix = rest.join('_');
  if (!suffix) return id;
  return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} ${suffix}`;
}

/** Maps a DynamoDB participant record to the client UserProfile shape. */
function toProfile(p) {
  const role = typeof p.role === 'number' ? p.role : Number(p.role) || 0;
  return {
    id: p.id,
    name: p.name || '',
    email: p.email || '',
    phone: p.phone != null && p.phone !== 0 ? String(p.phone) : '',
    churchName: p.church || p.church_name || '',
    teamCode: hasRealTeam(p) ? p.team_id : '',
    teamName: hasRealTeam(p) ? label(p.team_id) : '',
    roomNumber: hasRealRoom(p) ? label(p.room_id) : '',
    leadersId: [],
    roommatesId: [],
    isLeader: role === ROLE_LEADER,
    isMaintainer: role === ROLE_MAINTAINER,
  };
}
