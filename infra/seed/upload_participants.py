import pandas as pd
import boto3
import math

# 1. Configuration
TABLE_NAME = 'Participants'
CSV_FILE = 'participants.csv'
REGION_NAME = 'eu-west-1'  # Change to your AWS region (e.g., us-east-1)

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb', region_name=REGION_NAME)
table = dynamodb.Table(TABLE_NAME)


def clean_and_prepare_data(file_path):
    print(f"Reading data from {file_path}...")
    df = pd.read_csv(file_path)

    records = []
    for _, row in df.iterrows():
        # Handle potential empty/NaN values
        team_val = row['team']
        room_val = row['room']
        birthday = row['birthday']
        role_val = row['role']

        # Format team_id. A missing value or a negative sentinel (-1) means the
        # participant has no team yet; team 0 is reserved for staff.
        if pd.isna(team_val) or int(team_val) < 0:
            team_id = "unassigned"
        else:
            # Convert float 1.0 to int 1, then to string 'team_1'
            team_id = f"team_{int(team_val)}"

        # Format room_id
        if pd.isna(room_val) or int(room_val) < 0:
            room_id = "unassigned"
        else:
            room_id = f"room_{int(room_val)}"

        # Role is stored as its numeric i18n code (0 = 组员/member, 1 = 辅导/leader,
        # 2+ = staff sub-teams) so the frontend can translate it per locale.
        role_code = int(role_val) if pd.notna(role_val) else 0

        # Build the JSON/Dictionary object
        item = {
            'id': str(row['id']).strip(),
            'name': str(row['name']).strip(),
            'sex': str(row['sex']).strip(),
            'phone': int(row['phone']) if pd.notna(row['phone']) else 0,
            'church': str(row['church']).strip(),
            'role': role_code,
            'team_id': team_id,
            'room_id': room_id
        }

        # Only add birthday if it exists (DynamoDB schema-less allows omitting fields)
        if pd.notna(birthday):
            item['birthday'] = str(birthday).strip()

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


if __name__ == '__main__':
    try:
        # Step 1: Prepare the data
        participant_data = clean_and_prepare_data(CSV_FILE)

        # Step 2: Upload to DynamoDB
        upload_to_dynamodb(participant_data)

    except Exception as e:
        print(f"An error occurred: {e}")
