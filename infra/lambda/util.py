import json

CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,GET,PUT,OPTIONS',
}

def json_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS,
        'body': json.dumps(body)
    }
