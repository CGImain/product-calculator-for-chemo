"""
Migration script to add username_lower field to existing users.
Run this script once after deploying the case-insensitive username changes.
"""
import os
import sys
from pymongo import MongoClient
from bson.objectid import ObjectId
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def run_migration():
    """Add username_lower field to all users based on their username."""
    print("Starting migration: Adding username_lower to users...")
    
    # Get MongoDB connection details from environment
    mongo_uri = os.getenv('MONGO_URI')
    db_name = os.getenv('DB_NAME', 'comp')
    
    if not mongo_uri:
        print("❌ Error: MONGO_URI environment variable not set")
        sys.exit(1)
    
    try:
        # Connect to MongoDB
        client = MongoClient(mongo_uri, tls=True, tlsAllowInvalidCertificates=False)
        db = client[db_name]
        users_col = db['users']
        
        # Get all users without username_lower
        users = users_col.find({"username": {"$exists": True}, "username_lower": {"$exists": False}})
        user_count = 0
        
        print(f"Found {users_col.count_documents({})} total users in database")
        
        # Update each user
        for user in users:
            username = user.get('username')
            if not username:
                continue
                
            # Add username_lower field
            users_col.update_one(
                {"_id": user['_id']},
                {"$set": {"username_lower": username.lower()}}
            )
            user_count += 1
            
            # Print progress
            if user_count % 100 == 0:
                print(f"Updated {user_count} users...")
        
        print(f"✅ Migration complete. Updated {user_count} users with username_lower field.")
        
    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    run_migration()
