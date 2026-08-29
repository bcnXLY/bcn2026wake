import argparse
import csv
import boto3

# 1. Configuration
TABLE_NAME = 'Participants'
CSV_FILE = 'participants.csv'
REGION_NAME = 'eu-west-3'  # Deployed region for the Participants table.

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb', region_name=REGION_NAME)
table = dynamodb.Table(TABLE_NAME)


def parse_int(value):
    """Roster cells arrive as text; blank means 'not given'."""
    text = (value or '').strip()
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def parse_permissions(value):
    """The permissions column is a comma-separated list, e.g. "1, 2"."""
    codes = []
    for part in (value or '').split(','):
        code = parse_int(part)
        if code is not None and code not in codes:
            codes.append(code)
    return sorted(codes)


def clean_and_prepare_data(file_path):
    print(f"Reading data from {file_path}...")

    records = []
    with open(file_path, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            participant_id = (row.get('id') or '').strip()
            if not participant_id:
                continue

            team_val = parse_int(row.get('team'))
            room_val = parse_int(row.get('room'))
            phone_val = parse_int(row.get('phone'))
            role_val = parse_int(row.get('role'))
            birthday = (row.get('birthday') or '').strip()
            sex = (row.get('sex') or '').strip()

            # Format team_id. A missing value or a negative sentinel (-1) means the
            # participant has no team yet; team 0 is reserved for staff.
            if team_val is None or team_val < 0:
                team_id = "unassigned"
            else:
                team_id = f"team_{team_val}"

            # Format room_id
            if room_val is None or room_val < 0:
                room_id = "unassigned"
            else:
                room_id = f"room_{room_val}"

            # Role is stored as its numeric i18n code (0 = 组员/member, 1 = 辅导/leader,
            # 2+ = staff sub-teams) so the frontend can translate it per locale.
            role_code = role_val if role_val is not None else 0

            # Build the JSON/Dictionary object
            item = {
                'id': participant_id,
                'name': (row.get('name') or '').strip(),
                'phone': phone_val if phone_val is not None else 0,
                'church': (row.get('church') or '').strip(),
                'role': role_code,
                'team_id': team_id,
                'room_id': room_id,
            }

            if birthday:
                item['birthday'] = birthday
            if sex:
                item['sex'] = sex

            # Permission codes (1 = global chat, 2 = game master, 6-8 = honours).
            permissions = parse_permissions(row.get('permissions'))
            if permissions:
                item['permissions'] = permissions

            records.append(item)

    return records


def upload_to_dynamodb(records):
    print(f"Uploading {len(records)} records to DynamoDB table: {TABLE_NAME}...")

    # Use batch_writer for efficient bulk uploads
    # This automatically handles chunking requests to AWS
    with table.batch_writer() as batch:
        for i, item in enumerate(records):
            batch.put_item(Item=item)

            # Print progress every 50 items
            if (i + 1) % 50 == 0:
                print(f"Uploaded {i + 1} items...")

    print("Upload completed successfully!")


def scan_existing_ids():
    ids = set()
    kwargs = {'ProjectionExpression': 'id'}
    while True:
        res = table.scan(**kwargs)
        ids.update(item['id'] for item in res.get('Items', []))
        if 'LastEvaluatedKey' not in res:
            return ids
        kwargs['ExclusiveStartKey'] = res['LastEvaluatedKey']


def prune_removed(records, dry_run=False):
    """Delete rows the CSV no longer lists, so the table matches the roster.

    Without this an attendee dropped from the roster keeps their login, their
    old team and their place in someone else's roommate list.
    """
    stale = sorted(scan_existing_ids() - {item['id'] for item in records})
    if not stale:
        print("Nothing to prune: the table matches the CSV.")
        return

    print(f"{len(stale)} record(s) in the table are not in the CSV:")
    for participant_id in stale:
        print(f"  {participant_id}")

    if dry_run:
        print("Dry run: nothing deleted.")
        return

    with table.batch_writer() as batch:
        for participant_id in stale:
            batch.delete_item(Key={'id': participant_id})

    print(f"Deleted {len(stale)} record(s).")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Load the roster CSV into DynamoDB.')
    parser.add_argument('--csv', default=CSV_FILE, help=f'Roster CSV (default: {CSV_FILE})')
    parser.add_argument('--prune', action='store_true',
                        help='Also delete table rows the CSV no longer lists.')
    parser.add_argument('--dry-run', action='store_true',
                        help='Report what would change without writing.')
    args = parser.parse_args()

    try:
        # Step 1: Prepare the data
        participant_data = clean_and_prepare_data(args.csv)

        # Step 2: Upload to DynamoDB
        if args.dry_run:
            print(f"Dry run: {len(participant_data)} record(s) would be uploaded.")
        else:
            upload_to_dynamodb(participant_data)

        # Step 3: Optionally drop anyone the CSV no longer lists
        if args.prune:
            prune_removed(participant_data, dry_run=args.dry_run)

    except Exception as e:
        print(f"An error occurred: {e}")
