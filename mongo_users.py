"""MongoDB helper layer for user CRUD operations.

This module provides functions to interact with the MongoDB users collection.
It expects the MongoDB client and collection to be passed in from app.py.
"""
import re
import traceback
from datetime import datetime
from typing import Optional, Dict, Any
from werkzeug.security import generate_password_hash, check_password_hash

# These will be set by app.py
users_col = None

def init_mongo_connection(client, db):
    """Initialize the MongoDB connection from app.py
    
    Args:
        client: MongoDB client instance
        db: Either a database name (str) or database instance
    """
    global users_col
    
    # Handle case where db is a string (database name)
    if isinstance(db, str):
        db = client[db]
        
    users_col = db['users']
    
    try:
        # Ensure indexes
        users_col.create_index("email", unique=True)
        users_col.create_index("username", unique=True)
        users_col.create_index("username_lower", unique=True)
    except Exception as e:
        print(f"⚠️ Could not create indexes (they may already exist): {str(e)}")
        
    return users_col

def _to_public(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Return a dict suitable for serializing to the frontend (no password hash)."""
    return {
        "id": doc["_id"],
        "email": doc["email"],
        "username": doc["username"],
        "is_verified": doc.get("is_verified", False),
        "otp_verified": doc.get("otp_verified", False),
    }

# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

def find_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    if users_col is None:
        raise RuntimeError("MongoDB users_col is not initialized. Call init_mongo_connection first.")
    
    from bson import ObjectId
    
    # First try to find by _id as ObjectId
    try:
        user = users_col.find_one({"_id": ObjectId(user_id)})
        if user:
            user['_id'] = str(user['_id'])  # Convert ObjectId to string for JSON serialization
            return user
    except:
        pass  # Not a valid ObjectId, try other methods
    
    # If not found by ObjectId, try as string ID
    try:
        user = users_col.find_one({"_id": user_id})
        if user and '_id' in user:
            user['_id'] = str(user['_id'])
            return user
    except Exception as e:
        print(f"❌ Error finding user by string ID {user_id}: {str(e)}")
    
    # If still not found, try by email or username
    try:
        user = find_user_by_email_or_username(user_id)
        if user and '_id' in user:
            user['_id'] = str(user['_id'])
            return user
    except Exception as e:
        print(f"❌ Error finding user by email/username {user_id}: {str(e)}")
    
    return None


def find_user_by_email_or_username(identifier: str) -> Optional[Dict[str, Any]]:
    if users_col is None:
        raise RuntimeError("MongoDB users_col is not initialized. Call init_mongo_connection first.")
    ident = identifier.strip()
    # For email, use case-insensitive match with regex
    # For username, use case-insensitive match
    return users_col.find_one({
        "$or": [
            {"email": {"$regex": f"^{re.escape(ident)}$", "$options": "i"}},
            {"username": {"$regex": f"^{re.escape(ident)}$", "$options": "i"}}
        ]
    })


def email_or_username_exists(email: str, username: str) -> bool:
    if users_col is None:
        raise RuntimeError("MongoDB users_col is not initialized. Call init_mongo_connection first.")
    # Use case-insensitive search for both email and username
    return users_col.count_documents({
        "$or": [
            {"email": {"$regex": f"^{re.escape(email.strip())}$", "$options": "i"}},
            {"username": {"$regex": f"^{re.escape(username.strip())}$", "$options": "i"}}
        ]
    }) > 0

# ---------------------------------------------------------------------------
# Modification helpers
# ---------------------------------------------------------------------------

def create_user(email, username, password, **kwargs):
    """Create a new user in MongoDB"""
    if users_col is None:
        error_msg = "MongoDB users_col is not initialized. Call init_mongo_connection first."
        print(f" {error_msg}")
        raise RuntimeError(error_msg)
    
    # Normalize email to lowercase
    email = email.strip().lower()
    # Preserve username case for display but store original case
    username = username.strip()
    
    print(f" Creating user: {email} ({username})")
    
    # Check if user already exists (case-insensitive check)
    if email_or_username_exists(email, username):
        raise ValueError("Email or username already exists")
    
    # Hash the password (case-sensitive)
    password_hash = generate_password_hash(password)
    
    now = datetime.utcnow()
    user_doc = {
        'email': email,  # Always store email in lowercase
        'username_lower': username.lower(),  # For case-insensitive search
        'username': username,  # Original case for display
        'password_hash': password_hash,
        'created_at': now,
        'updated_at': now,
        'is_verified': False,
        'otp_verified': False,
        'role': 'user'
    }
    
    # Add any additional fields
    user_doc.update(kwargs)
    
    print(f"Attempting to insert user into MongoDB collection: {users_col.name}")
    print(f"Database: {users_col.database.name}")
    print(f"User document to insert: {user_doc}")
    
    # Insert the user
    try:
        result = users_col.insert_one(user_doc)
        user_id = str(result.inserted_id)
        print(f" User created successfully with ID: {user_id}")
        
        # Verify the user was created
        created_user = find_user_by_id(user_id)
        if not created_user:
            print("❌ Failed to verify user creation in database")
            raise Exception("Failed to verify user creation in database")
            
        print(f" Verified user creation: {created_user}")
        return user_id
        
    except Exception as e:
        print(f"❌ Error inserting user into MongoDB: {str(e)}")
        print(f"User document that failed: {user_doc}")
        # Check if the user was actually created despite the error
        try:
            existing = find_user_by_email_or_username(email)
            if existing:
                print(f" Found existing user after error: {existing}")
                return str(existing.get('_id'))
        except Exception as check_error:
            print(f" Error checking for existing user: {str(check_error)}")
        traceback.print_exc()
        raise

def update_user(user_id: str, changes: Dict[str, Any]):
    changes["updated_at"] = datetime.utcnow()
    users_col.update_one({"_id": user_id}, {"$set": changes})

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def verify_password(user_doc: Dict[str, Any], password: str) -> bool:
    print("\n=== Password Verification Debug ===")
    print(f"User document keys: {list(user_doc.keys())}")
    
    if "password_hash" not in user_doc:
        print("❌ Error: 'password_hash' key not found in user document")
        return False
        
    stored_hash = user_doc["password_hash"]
    print(f"Stored hash: {stored_hash}")
    print(f"Provided password: {password}")
    
    try:
        result = check_password_hash(stored_hash, password)
        print(f"Password check result: {result}")
        return result
    except Exception as e:
        print(f"❌ Error during password verification: {str(e)}")
        return False
