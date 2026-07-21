import os
import re
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from util import json_response

ddb = boto3.resource('dynamodb')
PARTICIPANTS_TABLE = os.environ.get('ATTENDEES_TABLE', '')

ROLE_MEMBER = 0
ROLE_LEADER = 1
ROLE_MAINTAINER = 8

UNASSIGNED = {'unassigned', 'team_0', 'room_0'}

def lambda_handler(event, context):
    query_params = event.get('queryStringParameters') or {}
    my_id = (query_params.get('id') or '').strip()
    
    if not my_id:
        return json_response(401, {'message': 'Unauthorized'})

    try:
        me = fetch_participant(my_id)
        if not me:
            return json_response(404, {'message': 'Participant not found'})

        roommates = fetch_roommates(me)

        if is_maintainer(me):
            view = maintainer_view()
        elif is_leader(me):
            view = leader_view(me)
        else:
            view = member_view(me)

        response_data = dict(view)
        response_data['roommates'] = roommates
        response_data['emergencyContacts'] = fetch_emergency_contacts()
        
        return json_response(200, response_data)
    except Exception as err:
        print(err)
        return json_response(500, {'message': 'Server error'})

def is_leader_role(role):
    return role == ROLE_LEADER

def is_maintainer_role(role):
    return role == ROLE_MAINTAINER

def get_role(item):
    role = item.get('role', 0)
    try:
        return int(role)
    except (ValueError, TypeError):
        return 0

def is_leader(p):
    return is_leader_role(get_role(p))

def is_maintainer(p):
    return is_maintainer_role(get_role(p))

def has_real_team(p):
    team_id = p.get('team_id')
    return bool(team_id) and team_id not in UNASSIGNED

def has_real_room(p):
    room_id = p.get('room_id')
    return bool(room_id) and room_id not in UNASSIGNED

def extract_numbers(id_str):
    if not id_str:
        return ''
    return ''.join(c for c in id_str if c.isdigit())

def to_person(item):
    phone = item.get('phone')
    phone_str = str(phone) if phone is not None and phone != 0 and phone != "0" and phone != "" else ""
    role = get_role(item)
    
    person = {
        'id': item.get('id'),
        'name': item.get('name', ''),
        'phone': phone_str,
        'role': role,
        'isLeader': is_leader_role(role),
        'isMaintainer': is_maintainer_role(role),
    }
    if has_real_room(item):
        person['roomNumber'] = extract_numbers(item.get('room_id'))
    return person

def by_name(item):
    return item.get('name') or ''

def fetch_participant(user_id):
    table = ddb.Table(PARTICIPANTS_TABLE)
    res = table.get_item(Key={'id': user_id})
    return res.get('Item')

def fetch_roommates(me):
    if not has_real_room(me):
        return []
    items = query_index('byRoom', 'room_id', me.get('room_id'))
    roommates = [to_person(item) for item in items if item.get('id') != me.get('id')]
    roommates.sort(key=by_name)
    return roommates

def fetch_emergency_contacts():
    items = query_index('byRole', 'role', 6)
    contacts = [to_person(item) for item in items]
    contacts.sort(key=by_name)
    return contacts

def member_view(me):
    if not has_real_team(me):
        return {'role': 'member', 'people': []}
    items = query_index('byTeam', 'team_id', me.get('team_id'))
    people = [to_person(item) for item in items if is_leader_role(get_role(item))]
    people.sort(key=by_name)
    return {'role': 'member', 'people': people}

def leader_view(me):
    if not has_real_team(me):
        return {'role': 'leader', 'people': []}
    items = query_index('byTeam', 'team_id', me.get('team_id'))
    people = [to_person(item) for item in items if item.get('id') != me.get('id') and get_role(item) == ROLE_MEMBER]
    people.sort(key=by_name)
    return {'role': 'leader', 'people': people}

def maintainer_view():
    items = scan_all()
    
    groups = {}
    for item in items:
        if not has_real_team(item):
            continue
        code = item.get('team_id')
        if code not in groups:
            groups[code] = {'teamCode': code, 'teamName': extract_numbers(code), 'members': []}
        groups[code]['members'].append(to_person(item))
        
    group_list = list(groups.values())
    for g in group_list:
        g['members'].sort(key=by_name)
        
    def natural_sort_key(g):
        return [int(text) if text.isdigit() else text.lower() for text in re.split('([0-9]+)', g.get('teamName', ''))]
        
    group_list.sort(key=natural_sort_key)
    
    maintainers = []
    for item in items:
        if is_maintainer_role(get_role(item)):
            person = to_person(item)
            if has_real_team(item):
                person['teamCode'] = item.get('team_id')
                person['teamName'] = extract_numbers(item.get('team_id'))
            maintainers.append(person)
    maintainers.sort(key=by_name)
    
    return {'role': 'maintainer', 'groups': group_list, 'maintainers': maintainers}

def query_index(index_name, key_name, value):
    if not value:
        return []
    table = ddb.Table(PARTICIPANTS_TABLE)
    items = []
    kwargs = {
        'IndexName': index_name,
        'KeyConditionExpression': Key(key_name).eq(value)
    }
    
    while True:
        res = table.query(**kwargs)
        items.extend(res.get('Items', []))
        if 'LastEvaluatedKey' in res:
            kwargs['ExclusiveStartKey'] = res['LastEvaluatedKey']
        else:
            break
    return items

def scan_all():
    table = ddb.Table(PARTICIPANTS_TABLE)
    items = []
    kwargs = {}
    
    while True:
        res = table.scan(**kwargs)
        items.extend(res.get('Items', []))
        if 'LastEvaluatedKey' in res:
            kwargs['ExclusiveStartKey'] = res['LastEvaluatedKey']
        else:
            break
    return items
