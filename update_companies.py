import json
import uuid
from datetime import datetime

def update_companies_json():
    # Read the existing JSON file
    with open('static/data/c.json', 'r', encoding='utf-8') as f:
        companies = json.load(f)
    
    # Update each company entry with the required fields
    for i, company in enumerate(companies):
        # Skip if already has _id (already processed)
        if '_id' in company:
            continue
            
        # Add the required fields
        company['_id'] = {'$oid': str(uuid.uuid4().hex[:24])}
        company['created_at'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%S%z')
        company['created_by'] = '68515df4f0b858c18746bbb4'
    
    # Write the updated data back to the file
    with open('static/data/c.json', 'w', encoding='utf-8') as f:
        json.dump(companies, f, indent=2, ensure_ascii=False)
    
    print("Successfully updated companies.json with the required fields.")

if __name__ == "__main__":
    update_companies_json()
