import os
import boto3
import json
import base64
import urllib.request
import urllib.parse
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key
from util import json_response
ddb = boto3.resource('dynamodb')
PARTICIPANTS_TABLE = os.environ.get('ATTENDEES_TABLE', '')

ROLE_MEMBER = 0
ROLE_LEADER = 1
ROLE_MAINTAINER = 8

UNASSIGNED = {'unassigned', 'team_0', 'room_0'}

def twilio_verify_start(to_phone):
    account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
    service_sid = os.environ.get('TWILIO_VERIFY_SERVICE_SID')
    
    if not account_sid or not auth_token or not service_sid:
        return

    url = f"https://verify.twilio.com/v2/Services/{service_sid}/Verifications"
    data = urllib.parse.urlencode({
        'To': to_phone,
        'Channel': 'sms'
    }).encode('ascii')
    
    req = urllib.request.Request(url, data=data)
    auth_b64 = base64.b64encode(f"{account_sid}:{auth_token}".encode('utf-8')).decode('ascii')
    req.add_header('Authorization', f'Basic {auth_b64}')
    
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except Exception as e:
        raise e

def twilio_verify_check(to_phone, code):
    account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
    service_sid = os.environ.get('TWILIO_VERIFY_SERVICE_SID')
    
    if not account_sid or not auth_token or not service_sid:
        return False

    url = f"https://verify.twilio.com/v2/Services/{service_sid}/VerificationCheck"
    data = urllib.parse.urlencode({
        'To': to_phone,
        'Code': code
    }).encode('ascii')
    
    req = urllib.request.Request(url, data=data)
    auth_b64 = base64.b64encode(f"{account_sid}:{auth_token}".encode('utf-8')).decode('ascii')
    req.add_header('Authorization', f'Basic {auth_b64}')
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read())
            return result.get('status') == 'approved'
    except Exception as e:
        return False

def lambda_handler(event, context):
    query_params = event.get('queryStringParameters') or {}
    user_id = (query_params.get('id') or '').strip()
    code = (query_params.get('code') or '').strip()
    
    if not user_id:
        return json_response(400, {'message': 'Missing id'})

    table = ddb.Table(PARTICIPANTS_TABLE)
    
    try:
        res = table.get_item(Key={'id': user_id})
        p = res.get('Item')
        if not p:
            return json_response(404, {'message': 'Unknown id'})

        role = p.get('role', 0)
        try:
            role = int(role)
        except (ValueError, TypeError):
            role = 0

        # Roles 1 and 8 require SMS 2FA
        if role in (ROLE_LEADER, ROLE_MAINTAINER):
            phone = p.get('phone')
            if not phone or phone == "":
                return json_response(400, {'message': 'Phone number not registered.'})
            
            phone_str = str(phone)
            if not phone_str.startswith('+'):
                phone_str = "+34" + phone_str

            if not code:
                # Initiate 2FA
                twilio_verify_start(phone_str)
                
                return json_response(200, {'requires2FA': True})
            else:
                # Verify 2FA code
                is_valid = twilio_verify_check(phone_str, code)
                
                if not is_valid:
                    return json_response(401, {'message': 'Invalid code'})

        return json_response(200, {'profile': to_profile(p)})
    except Exception as err:
        return json_response(500, {'message': 'Server error'})

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

def to_profile(p):
    role = p.get('role', 0)
    try:
        role = int(role)
    except (ValueError, TypeError):
        role = 0
    
    phone = p.get('phone')
    phone_str = str(phone) if phone is not None and phone != 0 and phone != "0" and phone != "" else ""
    
    team_code = extract_numbers(p.get('team_id')) if has_real_team(p) else ""
    room_number = extract_numbers(p.get('room_id')) if has_real_room(p) else ""
    
    leadersName = []
    if has_real_team(p):
        team_members = query_index('byTeam', 'team_id', p.get('team_id'))
        leadersName = [item.get('name', '') for item in team_members if int(item.get('role', 0) or 0) == ROLE_LEADER]
        
    roommatesName = []
    if has_real_room(p):
        room_members = query_index('byRoom', 'room_id', p.get('room_id'))
        roommatesName = [item.get('name', '') for item in room_members if item.get('id') != p.get('id')]
    
    return {
        'id': p.get('id'),
        'name': p.get('name', ''),
        'phone': phone_str,
        'churchName': p.get('church') or p.get('church_name') or '',
        'teamCode': team_code,
        'roomNumber': room_number,
        'leadersName': leadersName,
        'roommatesName': roommatesName,
        'isLeader': role == ROLE_LEADER,
        'isManager': role == ROLE_MAINTAINER,
    }
