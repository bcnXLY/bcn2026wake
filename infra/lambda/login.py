import os
import boto3
import time
import random
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

def send_sms(to_phone, body):
    account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
    from_phone = os.environ.get('TWILIO_PHONE_NUMBER')
    
    if not account_sid or not auth_token or not from_phone:
        return

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = urllib.parse.urlencode({
        'To': to_phone,
        'From': from_phone,
        'Body': body
    }).encode('ascii')
    
    req = urllib.request.Request(url, data=data)
    auth_b64 = base64.b64encode(f"{account_sid}:{auth_token}".encode('utf-8')).decode('ascii')
    req.add_header('Authorization', f'Basic {auth_b64}')
    
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except Exception as e:
        raise e

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
            if not code:
                # Initiate 2FA
                phone = p.get('phone')
                if not phone or phone == 0 or phone == "0" or phone == "":
                    return json_response(400, {'message': 'Phone number not registered. Please contact support.'})
                
                # Generate 6-digit OTP
                otp = str(random.randint(100000, 999999))
                expiry = int(time.time()) + 600 # 10 minutes from now
                
                # Save OTP to DB
                table.update_item(
                    Key={'id': user_id},
                    UpdateExpression="SET otp = :otp, otp_expires = :expiry",
                    ExpressionAttributeValues={
                        ':otp': otp,
                        ':expiry': expiry
                    }
                )
                
                # Send SMS
                phone_str = str(phone)
                # Ensure phone number has a + prefix (assuming standard E.164, though we just use what's in DB)
                if not phone_str.startswith('+'):
                    # Depending on local rules, you might prepend a country code, e.g., '+34' for Spain.
                    # Assuming the phone field in DB is already properly formatted or can be parsed by Twilio.
                    pass
                    
                send_sms(phone_str, f"Your BCN2026 Wake login code is: {otp}")
                
                return json_response(200, {'requires2FA': True})
            else:
                # Verify 2FA code
                saved_otp = p.get('otp')
                otp_expires = p.get('otp_expires', 0)
                
                if not saved_otp or saved_otp != code:
                    return json_response(401, {'message': 'Invalid code'})
                if int(time.time()) > int(otp_expires):
                    return json_response(401, {'message': 'Code has expired'})
                
                # Clear OTP
                table.update_item(
                    Key={'id': user_id},
                    UpdateExpression="REMOVE otp, otp_expires"
                )
                # Code valid, proceed to return profile

        return json_response(200, {'profile': to_profile(p)})
    except ClientError as err:
        print(err)
        return json_response(500, {'message': 'Server error'})
    except Exception as err:
        print(err)
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
        'isMaintainer': role == ROLE_MAINTAINER,
    }
