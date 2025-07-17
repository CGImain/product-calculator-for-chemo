from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session, make_response
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField
from wtforms.validators import DataRequired, Email
from waitress import serve
import os
import json
from datetime import datetime, timedelta
import uuid
import hashlib
import secrets
import smtplib
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import wraps
from flask_login import current_user
import random
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from bson.objectid import ObjectId
import socket  # Added for socket.timeout and socket.gaierror

# Import MongoDB users module
try:
    from mongo_users import (
        find_user_by_id as mu_find_user_by_id,
        find_user_by_email_or_username as mu_find_user_by_email_or_username,
        create_user as mu_create_user,
        verify_password as mu_verify_password,
        update_user as mu_update_user,
        users_col
    )
    MONGO_AVAILABLE = True
except (ImportError, RuntimeError) as e:
    print(f"MongoDB module not available: {e}")
    MONGO_AVAILABLE = False
    users_col = None

# Load environment variables
load_dotenv()

# Debug environment variables
print("\n=== Environment Variables ===")
print(f"MONGO_URI: {'Set' if os.getenv('MONGO_URI') else 'Not set'}")
print(f"DB_NAME: {os.getenv('DB_NAME', 'moneda_db')}")
print(f"USE_MONGO: {os.getenv('USE_MONGO', 'Not set')}")
print("===========================\n")

# CORS Configuration
from flask_cors import CORS
app = Flask(__name__)
# -------------------- Company selection enforcement --------------------

def company_required(view_func):
    """Decorator to ensure a company is selected before accessing product/cart pages.
    If a `company_id` query parameter is present, it will set the selected company
    in the session on-the-fly so that the request can proceed seamlessly.
    """
    @wraps(view_func)
    def wrapped_view(*args, **kwargs):
        app.logger.info("[DEBUG] company_required decorator called for %s", request.path)
        
        # If session already has a selected company, allow
        selected_company = session.get('selected_company', {})
        app.logger.info("[DEBUG] Current selected_company from session: %s", selected_company)
        
        if selected_company.get('id'):
            app.logger.info("[DEBUG] Company already selected, allowing access")
            return view_func(*args, **kwargs)

        # Check for company_name and company_email in session as fallback
        if session.get('company_name') or session.get('company_email'):
            app.logger.info("[DEBUG] Found company_name/email in session, creating selected_company")
            session['selected_company'] = {
                'id': session.get('company_id'),
                'name': session.get('company_name', ''),
                'email': session.get('company_email', '')
            }
            session.modified = True
            return view_func(*args, **kwargs)

        # Attempt to use company_id from query parameters (first-time access)
        company_id = request.args.get('company_id')
        app.logger.info("[DEBUG] No company in session, checking for company_id in query params: %s", company_id)
        
        if company_id:
            # Lazy import to avoid circular dependencies
            from app import get_company_name_by_id, get_company_email_by_id  # type: ignore
            company_name = get_company_name_by_id(company_id) or ''
            company_email = get_company_email_by_id(company_id) or ''
            app.logger.info("[DEBUG] Found company details - name: %s, email: %s", company_name, company_email)
            
            if company_name or company_email:
                session['selected_company'] = {
                    'id': company_id,
                    'name': company_name,
                    'email': company_email
                }
                session['company_name'] = company_name
                session['company_email'] = company_email
                session['company_id'] = company_id  # Ensure company_id is set in session
                session.modified = True
                app.logger.info("[DEBUG] Updated session with company details")
                return view_func(*args, **kwargs)

        # Otherwise, redirect to company selection
        app.logger.warning("[DEBUG] No company selected, redirecting to company selection")
        flash('Please select a company first.', 'warning')
        return redirect(url_for('company_selection'))
    return wrapped_view

# -----------------------------------------------------------------------

CORS(app, resources={
    r"/api/*": {
        "origins": ["*"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "supports_credentials": True
    }
})

# -------------------- MongoDB configuration --------------------
# Admin email for alerts
ADMIN_ALERT_EMAIL = os.getenv('ADMIN_ALERT_EMAIL', 'athulnair3096@gmail.com')

# Helper to send alert email

def send_alert_email(subject: str, body: str):
    """Send an alert email to admin; relies on environment variables SMTP_HOST, SMTP_PORT, EMAIL_USER, EMAIL_PASS"""
    try:
        # Get email configuration
        smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
        smtp_port = int(os.getenv('SMTP_PORT', 587))
        email_user = os.getenv('EMAIL_USER')
        email_pass = os.getenv('EMAIL_PASS')
        
        # Log configuration for debugging
        app.logger.info(f"Email config - Host: {smtp_host}, Port: {smtp_port}, User: {email_user}")
        
        # Validate configuration
        if not all([email_user, email_pass]):
            error_msg = 'Email credentials not fully configured; missing EMAIL_USER or EMAIL_PASS'
            app.logger.error(error_msg)
            return False
            
        if not ADMIN_ALERT_EMAIL:
            error_msg = 'No admin email address configured'
            app.logger.error(error_msg)
            return False
        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = email_user
        msg['To'] = ADMIN_ALERT_EMAIL
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        
        # Send email
        app.logger.info(f"Attempting to send email to {ADMIN_ALERT_EMAIL}")
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.ehlo()
            if smtp_port == 587:
                server.starttls()
                server.ehlo()
            
            app.logger.info("Logging into SMTP server...")
            server.login(email_user, email_pass)
            
            app.logger.info("Sending email message...")
            server.send_message(msg)
            server.quit()
            
        app.logger.info("Email sent successfully")
        return True
        
    except smtplib.SMTPException as e:
        error_msg = f"SMTP error sending email: {str(e)}"
    except socket.timeout:
        error_msg = "SMTP connection timed out"
    except socket.gaierror:
        error_msg = "SMTP server address could not be resolved"
    except Exception as e:
        error_msg = f"Unexpected error sending email: {str(e)}"
    
    app.logger.error(error_msg, exc_info=True)
    return False

# Initialize MongoDB if available
MONGO_AVAILABLE = False
USE_MONGO = os.environ.get('USE_MONGO', 'true').lower() == 'true'  # Default to True
DB_NAME = os.environ.get('DB_NAME', 'moneda_db')  # Get DB_NAME from environment or use default
MONGO_URI = os.getenv('MONGO_URI', '').strip()

mongo_client = None
mongo_db = None
users_col = None

print("\n=== MongoDB Configuration ===")
print(f"USE_MONGO: {USE_MONGO}")
print(f"MONGO_URI: {'Set' if MONGO_URI else 'Not set'}")
print(f"DB_NAME: {DB_NAME}")

if MONGO_URI and USE_MONGO:
    try:
        print("Attempting to connect to MongoDB...")
        
        # Updated MongoDB connection with SSL options
        from pymongo import MongoClient

        from pymongo.errors import ConnectionFailure, ConfigurationError, ServerSelectionTimeoutError
        
        # Initialize connection variables
        mongo_client = None
        connection_successful = False
        
        try:
            import certifi
            CA_FILE = certifi.where()
        except ImportError:
            CA_FILE = None
            print("⚠️  certifi not installed; proceeding without custom CA bundle")
        # First try with SSL and valid CA bundle
        try:
            mongo_client = MongoClient(
                MONGO_URI,
                tls=True,
                tlsCAFile=certifi.where(),  # Use certifi CA bundle
                retryWrites=True,
                w='majority',
                connectTimeoutMS=10000,
                socketTimeoutMS=10000,
                serverSelectionTimeoutMS=10000,
                maxIdleTimeMS=10000
            )
            # Test the connection
            mongo_client.admin.command('ping')
            print("✅ MongoDB connection successful with SSL")
            connection_successful = True
        except Exception as e:
            print(f"❌ MongoDB TLS connection failed: {str(e)}")
            print("Attempting connection with allowInvalidCertificates...")
            try:
                mongo_client = MongoClient(
                    MONGO_URI,
                    tls=True,
                    tlsCAFile=certifi.where(),  # Use certifi CA bundle
                    tlsAllowInvalidCertificates=True,
                    retryWrites=True,
                    w='majority',
                    connectTimeoutMS=10000,
                    socketTimeoutMS=10000,
                    serverSelectionTimeoutMS=10000,
                    maxIdleTimeMS=10000
                )
                # Test the connection
                mongo_client.admin.command('ping')
                print("✅ MongoDB connection successful with invalid certificates")
                connection_successful = True
            except Exception as e2:
                print(f"❌ MongoDB connection with invalid certificates also failed: {str(e2)}")
        
        # Set connection status and initialise collections only if successful
        if connection_successful and mongo_client:
            MONGO_AVAILABLE = True
            print("✅ MongoDB connection successful")

            # Set up database and collections
            mongo_db = mongo_client[DB_NAME]
            users_col = mongo_db['users']
        else:
            MONGO_AVAILABLE = False
            print("❌ MongoDB connection failed – this application requires MongoDB. Exiting.")
            raise SystemExit("MongoDB connection required but unavailable")
        
        # Initialize mongo_users with the connection
        try:
            from mongo_users import init_mongo_connection
            users_col = init_mongo_connection(mongo_client, mongo_db)
            print("✅ mongo_users initialized successfully")
            
            # Print database stats
            print(f"Using database: {mongo_db.name}")
            collections = mongo_db.list_collection_names()
            print(f"Collections: {collections}")
            
            if users_col is not None:
                try:
                    user_count = users_col.count_documents({})
                    print(f"Users count: {user_count}")
                except Exception as e:
                    print(f"⚠️ Could not count users: {str(e)}")
            
            MONGO_AVAILABLE = True
            
        except Exception as e:
            print(f"❌ Error initializing mongo_users: {str(e)}")
            raise
        
    except Exception as e:
        print(f"❌ Unexpected error during MongoDB setup: {str(e)}")
        print("Falling back to JSON storage")
        MONGO_AVAILABLE = False
        
    except Exception as e:
        print(f"❌ MongoDB connection error: {str(e)}")
        print("Falling back to JSON storage")
        MONGO_AVAILABLE = False
        mongo_client = None
        mongo_db = None
        users_col = None
else:
    print("MongoDB not enabled in configuration")
    
print("==============================\n")
JWT_SECRET = os.getenv('JWT_SECRET', 'your-secret-key')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION = 3600  # 1 hour

# Email Configuration
SMTP_SERVER = os.getenv('SMTP_HOST')
SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
SMTP_USERNAME = os.getenv('SMTP_USER')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD')
EMAIL_FROM = os.getenv('EMAIL_FROM')
EMAIL_FROM_NAME = os.getenv('EMAIL_FROM_NAME')

# Frontend URL for email links
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')

# Persistent file paths (Render users can attach a Disk at /var/data or set USERS_FILE_PATH/CART_FILE_PATH)
def _resolve_data_dir():
    # Determine writable directory for persistence
    preferred = os.getenv('DATA_DIR', '/var/data')
    try:
        os.makedirs(preferred, exist_ok=True)
        test_path = os.path.join(preferred, '.write_test')
        with open(test_path, 'w') as fp:
            fp.write('ok')
        os.remove(test_path)
        return preferred
    except Exception:
        fallback = os.path.join('static', 'data')
        os.makedirs(fallback, exist_ok=True)
        return fallback

DATA_DIR = _resolve_data_dir()
USERS_FILE = os.getenv('USERS_FILE_PATH', os.path.join(DATA_DIR, 'users.json'))
CART_FILE = os.getenv('CART_FILE_PATH', os.path.join(DATA_DIR, 'cart.json'))

# User class
class User(UserMixin):
    def __init__(self, id, email, username, password_hash, is_verified=False, otp_verified=False, cart=None, reset_token=None, reset_token_expiry=None, company_id=None):
        self.id = id
        self.email = email
        self.username = username
        self.password_hash = password_hash
        self.is_verified = is_verified
        self.otp_verified = otp_verified
        self.cart = cart if cart is not None else []
        self.reset_token = reset_token
        self.reset_token_expiry = reset_token_expiry
        self.company_id = company_id

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'username': self.username,
            'password_hash': self.password_hash,
            'is_verified': self.is_verified,
            'reset_token': self.reset_token,
            'reset_token_expiry': self.reset_token_expiry.isoformat() if self.reset_token_expiry else None,
            'otp_verified': self.otp_verified,
            'company_id': self.company_id
        }

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def generate_auth_token(self, expires_in=JWT_EXPIRATION):
        return jwt.encode(
            {'user_id': self.id, 'exp': datetime.utcnow() + timedelta(seconds=expires_in)},
            JWT_SECRET,
            algorithm=JWT_ALGORITHM
        )

    @staticmethod
    def verify_auth_token(token):
        try:
            data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return data.get('user_id')
        except:
            return None

# ---------------------------------------------------------------------------
# JSON persistence helpers
# ---------------------------------------------------------------------------
# Existing private helpers (_load_users_json / _save_users_json) are used by
# the rest of the code via these thin wrappers so the earlier calls to
# load_users()/save_users() continue to work without refactor.

def _load_users_json():
    """Load users from JSON file."""
    try:
        # Ensure the directory exists
        os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
        
        # Try to read the file
        try:
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                content = f.read()
                if not content.strip():
                    content = '{}'
                users_data = json.loads(content)
        except (FileNotFoundError, json.JSONDecodeError):
            # If file doesn't exist or is invalid JSON, create a new empty file
            with open(USERS_FILE, 'w', encoding='utf-8') as f:
                f.write('{}')
            users_data = {}
            
        users = {}
        for user_id, user_data in users_data.items():
            try:
                # Ensure all required fields exist
                if not all(key in user_data for key in ['email', 'username', 'password_hash']):
                    print(f"Skipping invalid user data: missing required fields")
                    continue
                
                users[user_id] = User(
                    id=user_id,
                    email=user_data['email'],
                    username=user_data['username'],
                    password_hash=user_data['password_hash'],
                    is_verified=user_data.get('is_verified', False),
                    otp_verified=user_data.get('otp_verified', False),
                    cart=user_data.get('cart', []),
                    reset_token=user_data.get('reset_token'),
                    reset_token_expiry=datetime.fromisoformat(user_data.get('reset_token_expiry')) if user_data.get('reset_token_expiry') else None,
                    company_id=user_data.get('company_id')
                )
            except Exception as e:
                print(f"Error loading user {user_id}: {e}")
                continue
        return users
    except Exception as e:
        print(f"Error loading users: {e}")
        try:
            # Create a fresh empty file with proper encoding
            os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
            with open(USERS_FILE, 'w', encoding='utf-8') as f:
                f.write('{}')
            return {}  # Return empty dict after creating new file
        except Exception as e:
            print(f"Error creating users file: {e}")
        return {}

# ... (rest of the code remains the same)

def load_user(user_id):
    """Load user by ID from either MongoDB or JSON."""
    if MONGO_AVAILABLE and USE_MONGO:
        # Try MongoDB first
        try:
            print(f'Loading user from MongoDB with ID: {user_id}')
            doc = mu_find_user_by_id(user_id)
            if not doc:
                print(f'User not found in MongoDB with ID: {user_id}')
                return None
                
            user = User(
                id=str(doc['_id']),  # Convert ObjectId to string
                email=doc['email'],
                username=doc['username'],
                password_hash=doc['password_hash'],
                is_verified=doc.get('is_verified', False),
                otp_verified=doc.get('otp_verified', False),
                company_id=doc.get('company_id')
            )
            print(f'Successfully loaded user: {user.email} (ID: {user.id})')
            return user
        except Exception as e:
            print(f"Error loading user {user_id}: {e}")
            return None
    
    # Fall back to JSON users
    users = _load_users_json()
    user_data = users.get(user_id) if hasattr(users, 'get') else None
    if user_data:
        return User(
            id=user_id,
            email=user_data['email'],
            username=user_data.get('username', user_data['email'].split('@')[0]),
            password_hash=user_data['password_hash'],
            is_verified=user_data.get('is_verified', False),
            otp_verified=user_data.get('otp_verified', False),
            cart=user_data.get('cart', []),
            reset_token=user_data.get('reset_token'),
            reset_token_expiry=user_data.get('reset_token_expiry'),
            company_id=user_data.get('company_id')
        )
    return None

def save_users(users_dict=None):
    """Legacy wrapper around _save_users_json."""
    return _save_users_json(users_dict)

def _save_users_json(users_dict=None):
    """Save users to JSON file. If no argument is provided, saves the global users dictionary."""
    try:
        # Ensure the directory exists
        os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
        
        # Get the users data to save
        if users_dict is None:
            users_dict = users
            
        # Create a temporary file
        temp_file = USERS_FILE + '.tmp'
        
        # Convert users to dictionary format
        user_data = {user_id: user.to_dict() for user_id, user in users_dict.items()}
        
        # Write to temporary file
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(user_data, f, indent=2)
        
        # Replace original file with temporary file atomically
        try:
            os.replace(temp_file, USERS_FILE)
        except FileNotFoundError:
            # If file doesn't exist, just rename the temp file
            os.rename(temp_file, USERS_FILE)
        
        # Verify the file was saved correctly
        try:
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                saved_data = json.load(f)
                if len(saved_data) != len(user_data):
                    raise Exception("File save verification failed")
        except Exception as e:
            print(f"Error verifying saved file: {e}")
            return False
        
        return True
    except Exception as e:
        print(f"Error saving users: {e}")
        try:
            # Clean up temp file if it exists
            if os.path.exists(temp_file):
                os.remove(temp_file)
        except Exception as cleanup_error:
            print(f"Error cleaning up temp file: {cleanup_error}")
        return False

# ----- Mongo wrappers overriding JSON if USE_MONGO -----
if USE_MONGO:
    def load_users():
        users_local = {}
        try:
            for doc in users_col.find():
                users_local[doc['_id']] = User(
                    id=doc['_id'],
                    email=doc.get('email'),
                    username=doc.get('username'),
                    password_hash=doc.get('password_hash'),
                    is_verified=doc.get('is_verified', False),
                    otp_verified=doc.get('otp_verified', False)
                )
        except Exception as e:
            print(f"Error loading users from MongoDB: {e}")
        return users_local

    def save_users(users_dict=None):
        try:
            if users_dict is None:
                users_dict = users
            for uid, user in users_dict.items():
                users_col.update_one({'_id': uid}, {'$set': user.to_dict()}, upsert=True)
            return True
        except Exception as e:
            print(f"Error saving users to MongoDB: {e}")
            return False

    users = load_users() # Initialize users from MongoDB
else:
    # Fallback to JSON versions defined above
    load_users = _load_users_json
    save_users = _save_users_json
    users = load_users() # Initialize users from JSON

# Add logging for debugging

print(f"SMTP Configuration:\n"
      f"SMTP_HOST: {SMTP_SERVER}\n"
      f"SMTP_PORT: {SMTP_PORT}\n"
      f"SMTP_USER: {SMTP_USERNAME}\n"
      f"EMAIL_FROM: {EMAIL_FROM}")

def check_email_config():
    """Check if email configuration is valid."""
    if not SMTP_SERVER or not SMTP_USERNAME or not SMTP_PASSWORD or not EMAIL_FROM:
        print("Warning: Email configuration is incomplete")
        return False
    return True

# Initialize email configuration
email_config_valid = check_email_config()

def refresh_email_config():
    """Periodically refresh email configuration."""
    global email_config_valid
    email_config_valid = check_email_config()

# Initialize Flask app with logging
import logging
import sys
from logging.handlers import RotatingFileHandler

# Configure root logger
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        RotatingFileHandler('app.log', maxBytes=10000, backupCount=1)
    ]
)

# Suppress Flask debug pin console output
logging.getLogger('werkzeug').setLevel(logging.WARNING)

# Create Flask app instance
app = Flask(__name__)

# Configure secret key
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-here')

class LoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    submit = SubmitField('Login')

# Configure session
app.secret_key = os.getenv('SECRET_KEY', 'dev-key-123')
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # Helps with CSRF protection
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=1)  # Session expires after 1 day

# Add regex_search filter to Jinja2 environment
@app.template_filter('regex_search')
def regex_search_filter(s, pattern):
    """Check if the pattern matches the string."""
    if not s or not pattern:
        return False
    return bool(re.search(pattern, str(s)))

app.logger.info("Flask app initialized")

# Initialize cart store
# -------------------- Cart storage abstractions --------------------
class MongoCartStore:
    """MongoDB-backed cart store with one cart document per user."""

    def __init__(self, db):
        self.col = db.get_collection('carts')
        app.logger.info("[DEBUG] Initialized MongoCartStore with collection: %s", self.col.name)

    def _doc(self, user_id):
        doc = self.col.find_one({"user_id": user_id})
        app.logger.debug(
            "[DEBUG] _doc(user_id=%s) - %s",
            user_id,
            f"Found document with {len(doc.get('products', []))} products" if doc else "No document found"
        )
        return doc or {}

    def get_cart(self, user_id):
        app.logger.debug("[DEBUG] get_cart(user_id=%s)", user_id)
        doc = self._doc(user_id)
        products = doc.get('products', [])
        app.logger.debug(
            "[DEBUG] Retrieved cart for user %s with %d products",
            user_id,
            len(products)
        )
        if products:
            app.logger.debug("[DEBUG] Sample product data: %s", str(products[0])[:200])
        return products

    def save_cart(self, user_id, products):
        app.logger.debug(
            "[DEBUG] save_cart(user_id=%s) - Saving %d products",
            user_id,
            len(products)
        )
        if products:
            app.logger.debug("[DEBUG] Sample product being saved: %s", str(products[0])[:200])
            
        result = self.col.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "products": products,
                    "updated_at": datetime.utcnow(),
                    "user_id": user_id  # Ensure user_id is set
                }
            },
            upsert=True
        )
        app.logger.debug(
            "[DEBUG] Cart save result - Matched: %d, Modified: %d, Upserted ID: %s",
            result.matched_count,
            result.modified_count,
            getattr(result, 'upserted_id', 'N/A')
        )
        return True

    def clear_cart(self, user_id):
        app.logger.info("[DEBUG] Clearing cart for user: %s", user_id)
        return self.save_cart(user_id, [])


# Fallback JSON/in-memory version ----------------------------------
class CartStore:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.cart = cls._load_cart()
        return cls._instance
    
    @staticmethod
    def _load_cart():
        try:
            if os.path.exists(CART_FILE):
                with open(CART_FILE, 'r') as f:
                    return json.load(f)
            return {"products": []}
        except Exception as e:
            print(f"Error loading cart: {e}")
            return {"products": []}
    
    @staticmethod
    def _save_cart(cart):
        try:
            os.makedirs(os.path.dirname(CART_FILE), exist_ok=True)
            with open(CART_FILE, 'w') as f:
                json.dump(cart, f, indent=2)
            return True
        except Exception as e:
            print(f"Error saving cart: {e}")
            return False
    
    def get_cart(self):
        return self.cart
    
    def save_cart(self, cart):
        self.cart = cart
        return self._save_cart(cart)

# Choose the appropriate cart store implementation
if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
    print("Using MongoCartStore for cart persistence")
    cart_store = MongoCartStore(mongo_db)
else:
    print("Using local JSON CartStore for cart persistence")
    cart_store = CartStore()

# -------------------- Cart helper wrappers --------------------

def get_user_cart():
    """Return a dict with a products list for the current user using MongoDB."""
    try:
        app.logger.info(f"[DEBUG] get_user_cart() called for user: {getattr(current_user, 'id', 'no-user')}")
        
        if not hasattr(current_user, 'id'):
            app.logger.warning("[DEBUG] No current_user.id, returning empty cart")
            return {"products": []}
            
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            app.logger.info("[DEBUG] Using MongoDB for cart storage")
            app.logger.info(f"[DEBUG] MongoDB status - MONGO_AVAILABLE: {MONGO_AVAILABLE}, USE_MONGO: {USE_MONGO}, mongo_db: {'available' if mongo_db is not None else 'None'}")
            
            try:
                products = cart_store.get_cart(current_user.id)
                app.logger.info(f"[DEBUG] Retrieved {len(products) if products else 0} products from MongoDB")
                if products:
                    app.logger.debug(f"[DEBUG] Sample product from MongoDB: {str(products[0])[:200]}...")
            except Exception as e:
                app.logger.error(f"[DEBUG] Error fetching cart from MongoDB: {str(e)}")
                products = []
            # Ensure all products have the correct structure
            for product in products:
                if 'calculations' not in product:
                    # If calculations are missing, recalculate them
                    if product.get('type') == 'blanket':
                        base_price = float(product.get('base_price', 0))
                        bar_price = float(product.get('bar_price', 0))
                        quantity = int(product.get('quantity', 1))
                        discount_percent = float(product.get('discount_percent', 0))
                        gst_percent = float(product.get('gst_percent', 18))
                        
                        price_per_unit = base_price + bar_price
                        subtotal = price_per_unit * quantity
                        discount_amount = subtotal * (discount_percent / 100)
                        discounted_subtotal = subtotal - discount_amount
                        gst_amount = (discounted_subtotal * gst_percent) / 100
                        final_total = discounted_subtotal + gst_amount
                        
                        product['calculations'] = {
                            'price_per_unit': round(price_per_unit, 2),
                            'subtotal': round(subtotal, 2),
                            'discount_amount': round(discount_amount, 2),
                            'discounted_subtotal': round(discounted_subtotal, 2),
                            'gst_amount': round(gst_amount, 2),
                            'final_total': round(final_total, 2)
                        }
                    elif product.get('type') == 'mpack':
                        price = float(product.get('unit_price', 0))
                        quantity = int(product.get('quantity', 1))
                        discount_percent = float(product.get('discount_percent', 0))
                        gst_percent = float(product.get('gst_percent', 12))
                        
                        discount_amount = (price * discount_percent / 100)
                        price_after_discount = price - discount_amount
                        gst_amount = (price_after_discount * gst_percent / 100)
                        final_unit_price = price_after_discount + gst_amount
                        final_total = final_unit_price * quantity
                        
                        product['calculations'] = {
                            'unit_price': round(price, 2),
                            'discount_amount': round(discount_amount, 2),
                            'price_after_discount': round(price_after_discount, 2),
                            'gst_amount': round(gst_amount, 2),
                            'final_unit_price': round(final_unit_price, 2),
                            'final_total': round(final_total, 2)
                        }
            
            return {"products": products or []}
            
        # If we get here, MongoDB is not available
        app.logger.warning("[DEBUG] MongoDB is not available for cart storage")
        app.logger.warning(f"[DEBUG] MONGO_AVAILABLE: {MONGO_AVAILABLE}, USE_MONGO: {USE_MONGO}, mongo_db: {'available' if 'mongo_db' in globals() and mongo_db is not None else 'None'}")
        return {"products": []}
        
    except Exception as e:
        print(f"Error in get_user_cart: {e}")
        import traceback
        traceback.print_exc()
        return {"products": []}

def save_user_cart(cart_dict):
    """Persist cart for current user using MongoDB."""
    try:
        if not hasattr(current_user, 'id'):
            print("Cannot save cart: No user ID available")
            return
            
        if not isinstance(cart_dict, dict) or 'products' not in cart_dict:
            print("Invalid cart format")
            return
            
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            cart_store.save_cart(current_user.id, cart_dict['products'])
        else:
            print("MongoDB is not available for cart storage")
            
    except Exception as e:
        print(f"Error in save_user_cart: {e}")
        import traceback
        traceback.print_exc()

# Initialize users dictionary (only for JSON fallback)
if USE_MONGO:
    users = {}
else:
    # Removed this line - it's causing the error
    # users = load_users()
    pass

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    if MONGO_AVAILABLE and USE_MONGO:
        try:
            print(f'Loading user from MongoDB with ID: {user_id}')
            doc = mu_find_user_by_id(user_id)
            if not doc:
                print(f'User not found in MongoDB with ID: {user_id}')
                return None
                
            user = User(
                id=str(doc['_id']),  # Convert ObjectId to string
                email=doc['email'],
                username=doc['username'],
                password_hash=doc['password_hash'],
                is_verified=doc.get('is_verified', False),
                otp_verified=doc.get('otp_verified', False),
                company_id=doc.get('company_id')
            )
            print(f'Successfully loaded user: {user.email} (ID: {user.id})')
            return user
        except Exception as e:
            print(f"Error loading user {user_id}: {e}")
            return None
    else:
        print('MongoDB not available, falling back to JSON users')
        user_data = users.get(user_id) if hasattr(users, 'get') else None
        if user_data:
            return User(
                id=user_id,
                email=user_data['email'],
                username=user_data.get('username', user_data['email'].split('@')[0]),
                password_hash=user_data['password_hash'],
                is_verified=user_data.get('is_verified', False),
                otp_verified=user_data.get('otp_verified', False),
                cart=user_data.get('cart', []),
                reset_token=user_data.get('reset_token'),
                reset_token_expiry=user_data.get('reset_token_expiry'),
                company_id=user_data.get('company_id')
            )
        return None

@app.route('/cart')
@login_required
@company_required
def cart():
    """Render the cart page with current cart contents and calculated totals.
    
    The Jinja template expects a cart object with products list and calculated totals.
    """
    try:
        # Get the current cart
        cart_data = get_user_cart()
        if not isinstance(cart_data, dict):
            cart_data = {"products": []}
        
        # Ensure products list exists
        cart_data.setdefault("products", [])
        
        # Calculate cart totals using the actual total field from each product
        total = 0
        if cart_data.get('products'):
            total = sum(
                float(p.get('calculations', {}).get('final_total', 0))
                for p in cart_data['products']
            )
            
            # If no calculations exist, fall back to total field
            if not total:
                total = sum(
                    float(p.get('total', 0))
                    for p in cart_data['products']
                )
            
            # Calculate discount amount if needed
            discount_amount = sum(
                float(p.get('calculations', {}).get('discount_amount', 0))
                for p in cart_data['products']
            )
            
            # Add calculated totals to the cart data
            cart_data['calculations'] = {
                'discount_amount': round(discount_amount, 2),
                'total': round(total, 2)
            }
        
        # Get company info with proper fallbacks
        selected_company = session.get('selected_company', {})
        
        # Get company name with fallbacks
        company_name = (
            selected_company.get('name') or 
            session.get('company_name') or 
            (hasattr(current_user, 'company_name') and current_user.company_name) or
            (current_user.company_id and get_company_name_by_id(current_user.company_id)) or 
            'Your Company'
        )
        
        # Get company email with fallbacks
        company_email = (
            selected_company.get('email') or 
            session.get('company_email') or
            (hasattr(current_user, 'company_email') and current_user.company_email) or
            (current_user.company_id and get_company_email_by_id(current_user.company_id)) or 
            ''
        )
        
        # Ensure session is updated with the latest values
        if company_name and company_name != 'Your Company':
            session['company_name'] = company_name
            session['company_email'] = company_email
            session['selected_company'] = {
                'name': company_name,
                'email': company_email
            }
            session.modified = True
            
        # Log the company info for debugging
        app.logger.info(f"Cart - Company: {company_name}, Email: {company_email}")
        return render_template('cart.html',
                           cart=cart_data,
                            products=cart_data.get('products', []),
                            company_name=company_name,
                            company_email=company_email,
                            # Calculate GST rates for each product
                            products_with_gst=[
                                {**p, 'gst_percent': 18.0 if p.get('type') == 'blanket' else 12.0}
                                for p in cart_data.get('products', [])
                            ],
                            calculations=cart_data.get('calculations', {
                                'subtotal': 0,
                                'gst_percent': 0,  # Will be calculated per product
                                'gst_amount': 0,
                                'total': 0
                            }))
        
    except Exception as e:
        error_msg = f"Error in cart route: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        app.logger.error(error_msg)
        # Return empty cart with error message
        return render_template('cart.html', 
                           cart={"products": []}, 
                           error=str(e),
                           company_name='',
                           company_email='',
                           products_with_gst=[],
                           calculations={
                               'subtotal': 0,
                               'gst_percent': 0,
                               'gst_amount': 0,
                               'total': 0
                           })

@app.route('/clear_cart', methods=['POST'])
@login_required
def clear_cart():
    """Clear current user's cart"""
    try:
        if current_user.is_authenticated:
            # For logged-in users, clear the cart from the database
            if USE_MONGO and MONGO_AVAILABLE and mongo_db is not None:
                mongo_db.carts.update_one(
                    {'user_id': str(current_user.id)},
                    {'$set': {'products': []}},
                    upsert=True
                )
            else:
                # Fallback to session for non-MongoDB
                session['cart'] = {'products': []}
        else:
            # For non-logged-in users, clear the session cart
            session['cart'] = {'products': []}
        
        session.modified = True
        return jsonify({'success': True, 'message': 'Cart cleared successfully'})
    except Exception as e:
        print(f"Error clearing cart: {e}")
        return jsonify({'error': 'Failed to clear cart', 'message': str(e)})

@app.route('/add_to_cart', methods=['POST'])
@login_required
@company_required
def add_to_cart():
    try:
        # Get request data and validate
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400

        # Validate required fields for blanket
        required_fields = ['type', 'name', 'machine', 'length', 'width', 'unit', 'quantity', 'base_price', 'bar_price', 'gst_percent']
        if data.get('type') == 'blanket' and not all(data.get(field) is not None for field in required_fields):
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {required_fields}'
            }), 400

        # Calculate prices based on product type
        if data.get('type') == 'blanket':
            # Get all required fields with proper defaults
            base_price = float(data.get('base_price', 0))
            bar_price = float(data.get('bar_price', 0))
            quantity = int(data.get('quantity', 1))
            discount_percent = float(data.get('discount_percent', 0))
            gst_percent = float(data.get('gst_percent', 18))
            
            # Calculate prices
            price_per_unit = base_price + bar_price
            subtotal = price_per_unit * quantity
            discount_amount = subtotal * (discount_percent / 100)
            discounted_subtotal = subtotal - discount_amount
            gst_amount = (discounted_subtotal * gst_percent) / 100
            final_total = discounted_subtotal + gst_amount
            
            # Get dimensions and other details
            length = float(data.get('length', 0))
            width = float(data.get('width', 0))
            unit = data.get('unit', 'mm')
            
            # Convert area to square meters if needed
            area_sq_m = length * width
            if unit == 'mm':
                area_sq_m = (length / 1000) * (width / 1000)
            elif unit == 'in':
                area_sq_m = (length * 0.0254) * (width * 0.0254)
            
            # Create product with all details
            product = {
                'type': 'blanket',
                'name': data.get('name', 'Custom Blanket'),
                'machine': data.get('machine', 'Unknown Machine'),
                'thickness': data.get('thickness', ''),
                'length': length,
                'width': width,
                'unit': unit,
                'bar_type': data.get('bar_type', 'None'),
                'bar_price': bar_price,
                'quantity': quantity,
                'base_price': base_price,
                'discount_percent': discount_percent,
                'gst_percent': gst_percent,
                'unit_price': round(price_per_unit, 2),
                'total_price': round(final_total, 2),
                'calculations': {
                    'areaSqM': round(area_sq_m, 4),
                    'ratePerSqMt': round(base_price / area_sq_m, 2) if area_sq_m > 0 else 0,
                    'basePrice': round(base_price, 2),
                    'pricePerUnit': round(price_per_unit, 2),
                    'subtotal': round(subtotal, 2),
                    'discount_percent': discount_percent,
                    'discount_amount': round(discount_amount, 2),
                    'discounted_subtotal': round(discounted_subtotal, 2),
                    'gst_percent': gst_percent,
                    'gst_amount': round(gst_amount, 2),
                    'final_price': round(final_total, 2)
                },
                'added_at': datetime.utcnow().isoformat()
            }
        else:
            # Handle other product types (mpack, etc.)
            product = {
                'type': data.get('type'),
                'name': data.get('name'),
                'unit_price': float(data.get('unit_price', 0)),
                'quantity': int(data.get('quantity', 1)),
                'discount_percent': float(data.get('discount_percent', 0)),
                'gst_percent': float(data.get('gst_percent', 12)),  # 12% GST for MPack
                # Include MPack specific details
                'machine': data.get('machine', ''),
                'thickness': data.get('thickness', ''),
                'size': data.get('size', '')
            }
            
            # Calculate prices for other product types if needed
            if product['type'] == 'mpack':
                price = product['unit_price']
                quantity = product['quantity']
                discount_percent = product['discount_percent']
                gst_percent = product['gst_percent']
                
                # Calculate prices
                discount_amount = (price * discount_percent / 100)
                price_after_discount = price - discount_amount
                gst_amount = (price_after_discount * gst_percent / 100)
                final_unit_price = price_after_discount + gst_amount
                final_total = final_unit_price * quantity
                
                # Set all price fields
                product['unit_price'] = round(price, 2)
                product['discount_amount'] = round(discount_amount, 2)
                product['price_after_discount'] = round(price_after_discount, 2)
                product['gst_amount'] = round(gst_amount, 2)
                product['final_unit_price'] = round(final_unit_price, 2)
                product['total_price'] = round(final_total, 2)
                
                # Store calculations
                product['calculations'] = {
                    'unit_price': product['unit_price'],
                    'discount_amount': product['discount_amount'],
                    'price_after_discount': product['price_after_discount'],
                    'gst_amount': product['gst_amount'],
                    'final_unit_price': product['final_unit_price'],
                    'final_total': product['total_price'],
                    'machine': product.get('machine', ''),
                    'thickness': product.get('thickness', ''),
                    'size': product.get('size', '')
                }
        
        # Get existing cart or create new one
        try:
            cart = get_user_cart()
            if not isinstance(cart, dict):
                cart = {'products': []}
            if 'products' not in cart:
                cart['products'] = []
            
            # Check for duplicate products with same dimensions if force_add is not True
            if not data.get('force_add'):
                duplicate_index = -1
                product_type = product.get('type')
                
                if product_type == 'blanket':
                    for idx, item in enumerate(cart['products']):
                        if (item.get('type') == 'blanket' and 
                            abs(float(item.get('length', 0)) - float(product.get('length', 0))) < 0.01 and 
                            abs(float(item.get('width', 0)) - float(product.get('width', 0))) < 0.01 and 
                            item.get('thickness') == product.get('thickness') and
                            item.get('bar_type') == product.get('bar_type')):
                            duplicate_index = idx
                            break
                
                # Check for duplicate MPacks with same specifications
                elif product_type == 'mpack':
                    for idx, item in enumerate(cart['products']):
                        if (item.get('type') == 'mpack' and 
                            item.get('machine') == product.get('machine') and
                            item.get('thickness') == product.get('thickness') and
                            item.get('size') == product.get('size')):
                            duplicate_index = idx
                            break
                
                if duplicate_index >= 0:
                    # Return info about duplicate product
                    return jsonify({
                        'success': False,
                        'is_duplicate': True,
                        'duplicate_index': duplicate_index,
                        'message': 'A product with the same dimensions already exists in your cart.'
                    })
                
            # If no duplicate found, add the product to cart
            cart['products'].append(product)
            
            # Save updated cart
            save_user_cart(cart)
            
            # Get updated cart count
            updated_cart = get_user_cart()
            cart_count = len(updated_cart.get('products', [])) if updated_cart and isinstance(updated_cart, dict) else 0
            
            return jsonify({
                'success': True,
                'is_duplicate': False,
                'message': 'Product added to cart successfully',
                'cart_count': cart_count
            })
        except Exception as e:
            app.logger.error(f"Error saving cart: {str(e)}")
            return jsonify({
                'success': False,
                'error': f'Failed to save cart: {str(e)}'
            }), 500
    except Exception as e:
        app.logger.error(f"Error adding to cart: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Internal server error: {str(e)}'
        }), 500
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500

@app.route('/get_cart')
@login_required
def get_cart():
    """Return the current user's cart as JSON."""
    try:
        cart = get_user_cart()
        return jsonify(cart)
    except Exception as e:
        print(f"Error get_cart: {e}")
        return jsonify({'error': 'Failed to get cart', 'products': []}), 500

@app.route('/remove_from_cart', methods=['POST'])
@login_required
def remove_from_cart():
    """Remove the product at `index` from the user's cart."""
    data = request.get_json() or {}
    try:
        idx = int(data.get('index'))
    except (TypeError, ValueError):
        return jsonify({'error': 'invalid index'}), 400

    try:
        cart = get_user_cart()
        products = cart.get('products', [])
        
        if 0 <= idx < len(products):
            products.pop(idx)
            save_user_cart({'products': products})
            return jsonify({
                'success': True,
                'cart_count': len(products)
            })
            
        return jsonify({'error': 'invalid index'}), 400
    except Exception as e:
        print(f"Error in remove_from_cart: {e}")
        return jsonify({'error': 'Failed to remove item from cart'}), 500


@app.route('/update_cart_quantity', methods=['POST'])
@login_required
def update_cart_quantity():
    """Update the quantity of a product in the user's cart."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'message': 'No data provided'
            }), 400
            
        index = int(data.get('index'))
        quantity = int(data.get('quantity', 1))
        
        # Validate quantity
        if quantity < 1:
            return jsonify({
                'success': False,
                'message': 'Quantity must be at least 1'
            }), 400
        
        # Get current cart
        cart = get_user_cart()
        products = cart.get('products', [])
        
        # Check if index is valid
        if 0 <= index < len(products):
            # Update the quantity
            products[index]['quantity'] = quantity
            
            # Recalculate prices if needed (for blankets)
            if products[index].get('type') == 'blanket':
                # Recalculate blanket prices
                base_price = products[index].get('base_price', 0)
                bar_price = products[index].get('bar_price', 0)
                discount_percent = products[index].get('discount_percent', 0)
                gst_percent = products[index].get('gst_percent', 18)
                
                # Recalculate all values
                price_per_unit = base_price + bar_price
                subtotal = price_per_unit * quantity
                discount_amount = subtotal * (discount_percent / 100)
                discounted_subtotal = subtotal - discount_amount
                gst_amount = (discounted_subtotal * gst_percent) / 100
                final_total = discounted_subtotal + gst_amount
                
                # Update all price fields
                products[index].update({
                    'unit_price': round(price_per_unit, 2),
                    'total_price': round(final_total, 2),
                    'calculations': {
                        **products[index].get('calculations', {}),
                        'subtotal': round(subtotal, 2),
                        'discount_amount': round(discount_amount, 2),
                        'discounted_subtotal': round(discounted_subtotal, 2),
                        'gst_amount': round(gst_amount, 2),
                        'final_price': round(final_total, 2)
                    }
                })
            
            # Get the updated item
            updated_item = products[index]
            
            # Save the updated cart
            save_user_cart({'products': products})
            
            return jsonify({
                'success': True,
                'message': 'Cart quantity updated',
                'cart_count': len(products),
                'updated_item': updated_item
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Invalid item index',
                'cart_count': len(products)
            }), 400
    except Exception as e:
        app.logger.error(f'Error updating cart quantity: {str(e)}')
        return jsonify({
            'success': False,
            'message': 'An error occurred while updating the cart quantity',
            'error': str(e)
        }), 500


@app.route('/get_cart_count')
def get_cart_count():
    """Return the number of products currently in the user's cart."""
    try:
        if not current_user.is_authenticated:
            return jsonify({'count': 0})
            
        cart = get_user_cart()
        return jsonify({'count': len(cart.get('products', []))})
    except Exception as e:
        print(f"Error in get_cart_count: {e}")
        return jsonify({'count': 0})

def load_companies_data():
    """Load companies data from MongoDB or fall back to JSON file."""
    try:
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            # Get companies from MongoDB, including alternate field names that may exist
            projection = {
                '_id': 1,
                'name': 1,
                'email': 1,
                'Company Name': 1,
                'company_name': 1,
                'EmailID': 1,
                'emailID': 1,
                'emailId': 1,
                'Email Id': 1,
                'Email': 1
            }
            companies = list(mongo_db.companies.find({}, projection))

            mapped_companies = []
            for company in companies:
                # Extract ID first
                company_id = str(company.pop('_id'))

                # Attempt to resolve name and email using various possible keys (case & space insensitive)
                potential_name_keys = [
                    'name', 'company name', 'company_name', 'companyname'
                ]
                potential_email_keys = [
                    'email', 'emailid', 'email_id', 'email id'
                ]

                name = None
                email = None

                # Normalize keys for robust lookup
                normalized_dict = {k.lower().replace(' ', ''): v for k, v in company.items()}

                for key in potential_name_keys:
                    if key.replace(' ', '') in normalized_dict and normalized_dict[key.replace(' ', '')]:
                        name = normalized_dict[key.replace(' ', '')]
                        break

                for key in potential_email_keys:
                    if key.replace(' ', '') in normalized_dict and normalized_dict[key.replace(' ', '')]:
                        email = normalized_dict[key.replace(' ', '')]
                        break

                # Skip entries without a valid name (frontend requires it)
                if not name:
                    continue

                mapped_companies.append({
                    'id': company_id,
                    'name': name,
                    'email': email or ''  # Email is optional but keep empty string if missing
                })

            return mapped_companies
        else:
            # Fall back to JSON file
            companies_file = os.path.join('static', 'data', 'companies.json')
            if os.path.exists(companies_file):
                with open(companies_file, 'r', encoding='utf-8') as f:
                    companies_data = json.load(f)
                    return companies_data.get('companies', [])
            return []
    except Exception as e:
        app.logger.error(f"Error loading companies: {str(e)}")
        return []

@app.route('/')
@app.route('/index')
@login_required
def index():
    try:
        companies = load_companies_data()
        
        # Ensure companies is a list before passing to template
        if not isinstance(companies, list):
            companies = []
            
        return render_template('index.html', companies=companies)
        
    except Exception as e:
        app.logger.error(f"Error in index route: {str(e)}")
        # Return empty companies list on error
        return render_template('index.html', companies=[])

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return jsonify({'success': True, 'redirectTo': '/index'}) if request.method == 'POST' else redirect(url_for('index'))
    
    if request.method == 'POST':
        # Handle POST request - this should never happen since we use API route
        return jsonify({'error': 'Use /api/auth/login for POST requests'}), 400
    
    return render_template('login.html')

@app.route('/signup')
def signup():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template('signup.html')

@app.route('/company-selection', methods=['GET', 'POST'])
@login_required
def company_selection():
    if request.method == 'POST':
        company = request.form.get('company')
        email = request.form.get('email')
        
        if not company or not email:
            flash('Please select a company and enter an email', 'error')
            return redirect(url_for('company_selection'))
        
        # Save company info in session for convenience
        session['company'] = company
        session['email'] = email

        # Store a consistent dict for selected_company used by downstream routes
        session['selected_company'] = {
            'name': company,
            'email': email
        }
        
        # Redirect to product selection
        return redirect(url_for('product_selection'))
    
    return render_template('company_selection.html')

@app.route('/product_selection', methods=['GET', 'POST'])
@login_required
def product_selection():
    if request.method == 'POST':
        product_type = request.form.get('product_type')
        
        if not product_type:
            flash('Please select a product type', 'error')
            return redirect(url_for('product_selection'))
            
        # Save product type in session
        session['product_type'] = product_type
        
        # Redirect to appropriate product details page
        if product_type == 'blanket':
            return redirect(url_for('blankets'))
        elif product_type == 'mpack':
            return redirect(url_for('mpacks'))
            
    # Check if company is selected
    selected_company = session.get('selected_company')
    if not selected_company:
        return redirect(url_for('company_selection'))
    
    return render_template('product_selection.html')


@app.route('/select_company', methods=['GET', 'POST'])
@login_required
def select_company():
    app.logger.info(f"Select company request: {request.method}")
    
    if request.method == 'POST':
        try:
            # Get form data
            company_id = request.form.get('company_id')
            company_name = request.form.get('company_name')
            company_email = request.form.get('company_email')
            
            app.logger.info(f"Company selection - ID: {company_id}, Name: {company_name}")
            
            if not all([company_id, company_name, company_email]):
                app.logger.warning("Missing company information in form")
                flash('Please select a valid company', 'error')
                return redirect(url_for('company_selection'))
            
            # Update user's company in the database
            if USE_MONGO and MONGO_AVAILABLE:
                result = users_col.update_one(
                    {'_id': current_user.id},
                    {'$set': {
                        'company_id': company_id,
                        'company_name': company_name,
                        'company_email': company_email,
                        'updated_at': datetime.utcnow()
                    }}
                )
                app.logger.info(f"MongoDB update result: {result.matched_count} documents modified")
            else:
                # Fallback to JSON storage
                users = _load_users_json()
                user_id_str = str(current_user.id)
                if user_id_str in users:
                    users[user_id_str]['company_id'] = company_id
                    users[user_id_str]['company_name'] = company_name
                    users[user_id_str]['company_email'] = company_email
                    _save_users_json(users)
            
            # Update session
            session['company_id'] = company_id
            session['company_name'] = company_name
            session['company_email'] = company_email
            session['selected_company'] = {
                'id': company_id,
                'name': company_name,
                'email': company_email
            }
            
            # Ensure session is saved
            session.modified = True
            
            app.logger.info(f"Company selected: {company_name} ({company_id})")
            flash('Company selected successfully!', 'success')
            return redirect(url_for('product_selection'))
            
        except Exception as e:
            app.logger.error(f"Error in select_company: {str(e)}", exc_info=True)
            flash('An error occurred while processing your request. Please try again.', 'error')
            return redirect(url_for('company_selection'))
    
    # For GET requests, just render the template
    return render_template('company_selection.html')

# -------------------- Cart helper wrappers --------------------

def get_companies():
    try:
        # Load companies from static JSON file
        file_path = os.path.join(app.root_path, 'static', 'data', 'company_emails.json')
        app.logger.info(f"Loading companies from: {file_path}")
        with open(file_path, 'r', encoding='utf-8') as f:
            companies = json.load(f)
            
        # Create a list to store unique companies (by email)
        unique_companies = {}
        
        # Process companies and ensure unique emails
        for i, company in enumerate(companies, 1):
            email = company.get('EmailID', '').strip().lower()
            name = company.get('Company Name', '').strip()
            
            # Skip if email is missing or already processed
            if not email or email in unique_companies:
                continue
                
            # Add to unique companies with a consistent ID based on email hash
            unique_id = hashlib.md5(email.encode('utf-8')).hexdigest()
            unique_companies[email] = {
                'id': unique_id,
                'name': name,
                'email': email
            }
        
        # Convert to list and sort by company name
        result = sorted(unique_companies.values(), key=lambda x: x['name'].lower())
        return result
        
    except Exception as e:
        app.logger.error(f"Error loading companies: {str(e)}")
        return []

# Redirect old forgot-password URL to reset-password
@app.route('/forgot-password')
def forgot_password_redirect():
    return redirect(url_for('reset_password_page'))

# API Routes

# Company Management
@app.route('/api/companies', methods=['GET'])
@app.route('/get_companies', methods=['GET'])  # Add this line to support both endpoints
@login_required
def api_get_companies():
    """Get all companies from the database"""
    try:
        companies = load_companies_data()  # Use the helper function directly
        if not companies:
            return jsonify({'error': 'No companies found'}), 404
            
        # Convert to list of dicts if it's a dict
        if isinstance(companies, dict):
            companies = [{'id': k, 'name': v.get('name'), 'email': v.get('email')} 
                        for k, v in companies.items()]
            
        return jsonify(companies)
    except Exception as e:
        app.logger.error(f"Error getting companies: {str(e)}")
        return jsonify({'error': 'Failed to load companies'}), 500

# Machines list endpoint
@app.route('/api/machines', methods=['GET'])
@login_required
def api_get_machines():
    """Return list of machines.
    Primary design: store machines inside a single *master* document that has an
    array field called `machines`.  If such a document doesn’t exist (e.g. data
    migrated differently), fall back to scanning the whole collection and
    returning each document’s id / name pair.  This guarantees the endpoint
    always returns an array of objects like: [{"id": 1, "name": "Heidelberg"}, …]
    """
    if not (MONGO_AVAILABLE and USE_MONGO and mongo_db is not None):
        return jsonify([])

    try:
        # Preferred structure – one master document with `machines` array
        master_doc = mongo_db.machine.find_one({'machines': {'$exists': True}})
        if master_doc and isinstance(master_doc.get('machines'), list):
            return jsonify(master_doc.get('machines', []))

        # Fallback: each machine as its own document
        cursor = mongo_db.machine.find({}, {'_id': 0, 'id': 1, 'name': 1})
        machines = []
        for doc in cursor:
            # Some datasets might store ObjectIds or missing incremental id.
            # Ensure we always provide an `id` (string) and `name`.
            m_id = str(doc.get('id', doc.get('_id')))
            m_name = doc.get('name')
            if m_name:
                machines.append({'id': m_id, 'name': m_name})

        return jsonify(machines)
    except Exception as e:
        app.logger.error(f"Error fetching machines: {str(e)}")
        return jsonify([])

@app.route('/api/session/update', methods=['POST'])
@login_required
def api_update_session():
    """Update session data such as selected_company from the frontend."""
    if not request.is_json:
        return jsonify({'status': 'error', 'message': 'Request must be JSON'}), 400

    data = request.get_json()

    # Update any keys that the frontend sends (e.g., selected_company)
    allowed_keys = {'selected_company', 'company_id', 'company_name', 'company_email'}
    updated_any = False
    for key in allowed_keys:
        if key in data:
            session[key] = data[key]
            updated_any = True

    if updated_any:
        session.modified = True
        return jsonify({'status': 'success', 'message': 'Session updated'}), 200
    else:
        return jsonify({'status': 'error', 'message': 'No valid keys provided'}), 400

# ---------------------- Static JSON Data Endpoints ----------------------

@app.route('/blanket_categories')
@login_required
def api_blanket_categories():
    """Serve blanket categories JSON to frontend."""
    try:
        file_path = os.path.join(app.root_path, 'static', 'products', 'blankets', 'blanket_categories.json')
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        app.logger.error("blanket_categories.json not found at %s", file_path)
        return jsonify({'error': 'Blanket categories data not found'}), 404
    except Exception as e:
        app.logger.error("Error reading blanket_categories.json: %s", e)
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/blanket_data')
@login_required
def api_blanket_data():
    """Serve blankets data JSON to frontend."""
    try:
        file_path = os.path.join(app.root_path, 'static', 'products', 'blankets', 'blankets.json')
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        app.logger.error("blankets.json not found at %s", file_path)
        return jsonify({'error': 'Blankets data not found'}), 404
    except Exception as e:
        app.logger.error("Error reading blankets.json: %s", e)
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/thickness_data')
@login_required
def api_thickness_data():
    """Serve thickness data JSON to frontend."""
    try:
        # Prefer blankets folder thickness.json, fallback to static/data/thickness.json
        primary_path = os.path.join(app.root_path, 'static', 'products', 'blankets', 'thickness.json')
        fallback_path = os.path.join(app.root_path, 'static', 'data', 'thickness.json')
        file_path = primary_path if os.path.exists(primary_path) else fallback_path
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        app.logger.error("thickness.json not found at %s", file_path)
        return jsonify({'error': 'Thickness data not found'}), 404
    except Exception as e:
        app.logger.error("Error reading thickness.json: %s", e)
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/bar_data')
@login_required
def api_bar_data():
    """Serve bar data JSON to frontend."""
    try:
        file_path = os.path.join(app.root_path, 'static', 'products', 'blankets', 'bar.json')
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        app.logger.error("bar.json not found at %s", file_path)
        return jsonify({'error': 'Bar data not found'}), 404
    except Exception as e:
        app.logger.error("Error reading bar.json: %s", e)
        return jsonify({'error': 'Internal server error'}), 500

# Company Search Endpoint
@app.route('/api/companies/search', methods=['GET'])
@login_required
def search_companies():
    """Search for companies by name"""
    query = request.args.get('q', '').lower().strip()
    if not query or len(query) < 2:
        return jsonify([])
    
    try:
        # Search in MongoDB if available
        if MONGO_AVAILABLE and USE_MONGO:
            # Search in both name and address fields
            regex_pattern = f'.*{re.escape(query)}.*'
            companies = list(mongo_db.companies.find({
                '$or': [
                    {'name': {'$regex': regex_pattern, '$options': 'i'}},
                    {'address': {'$regex': regex_pattern, '$options': 'i'}}
                ]
            }).limit(10))
            
            # Convert ObjectId to string for JSON serialization
            for company in companies:
                company['id'] = str(company.pop('_id'))
        else:
            # Fallback to JSON file if needed
            companies_file = os.path.join('data', 'companies.json')
            if os.path.exists(companies_file):
                with open(companies_file, 'r') as f:
                    all_companies = json.load(f)
                
                # Simple case-insensitive search
                companies = [
                    {**c, 'id': c['id']} for c in all_companies 
                    if query in c.get('name', '').lower() or 
                       query in c.get('address', '').lower()
                ][:10]
            else:
                companies = []
        
        return jsonify(companies)
    except Exception as e:
        app.logger.error(f"Error searching companies: {str(e)}")
        return jsonify({'error': 'Failed to search companies'}), 500

@app.route('/api/update_company', methods=['POST'])
@login_required
def update_user_company():
    """Update the current user's company"""
    if not request.is_json:
        return jsonify({'status': 'error', 'message': 'Request must be JSON'}), 400
    
    data = request.get_json()
    company_id = data.get('company_id')
    
    if not company_id:
        return jsonify({'status': 'error', 'message': 'Company ID is required'}), 400
    
    try:
        # Update user's company in the database
        if MONGO_AVAILABLE and USE_MONGO and users_col is not None:
            # Ensure company_id is stored in the correct BSON type when possible
            try:
                company_id_casted = ObjectId(company_id)
            except Exception:
                # Keep the original value if it is not a valid ObjectId
                company_id_casted = company_id

            # Update in MongoDB only – do not create new user docs here
            result = users_col.update_one(
                {'_id': current_user.id},
                {'$set': {'company_id': company_id_casted}}
            )
            if result.matched_count == 0:
                # User document missing – create it so that the company can be saved
                user_doc = users_col.find_one({'_id': current_user.id})
                if not user_doc:
                    new_doc = {
                        '_id': current_user.id,
                        'username': getattr(current_user, 'username', str(current_user.id)),
                        'username_lower': (getattr(current_user, 'username', '') or str(current_user.id)).lower(),
                        'email': getattr(current_user, 'email', ''),
                        'company_id': company_id_casted,
                    }
                    try:
                        users_col.insert_one(new_doc)
                    except Exception as dup_err:
                        # Handle duplicate key gracefully
                        try:
                            from pymongo.errors import DuplicateKeyError
                            if isinstance(dup_err, DuplicateKeyError):
                                app.logger.warning("Duplicate key on user insert, falling back to update: %s", dup_err)
                                # Ensure username_lower is unique by appending user id
                                safe_username_lower = f"user_{current_user.id}"
                                users_col.update_one(
                                    {'_id': current_user.id},
                                    {'$set': {
                                        'company_id': company_id_casted,
                                        'username_lower': safe_username_lower
                                    }},
                                    upsert=True
                                )
                            else:
                                app.logger.error("Error inserting user doc: %s", dup_err)
                        except ImportError:
                            app.logger.error("pymongo DuplicateKeyError not available; error: %s", dup_err)
                else:
                    # If a document exists but was not matched (unlikely), update company_id
                    users_col.update_one({'_id': current_user.id}, {'$set': {'company_id': company_id_casted}})
            # No error even if modified_count == 0 (company already set)
        else:
            # Update in JSON file
            users = load_users()
            if str(current_user.id) not in users:
                return jsonify({'status': 'error', 'message': 'User not found'}), 404
                
            users[str(current_user.id)]['company_id'] = company_id
            save_users()
        
        # Update session
        session['company_id'] = company_id
        
        # Get company details for response
        company_name = get_company_name_by_id(company_id)
        company_email = get_company_email_by_id(company_id)
        
        # Update session with company details
        session['company_name'] = company_name
        session['company_email'] = company_email
        
        return jsonify({
            'status': 'success',
            'message': 'Company updated successfully',
            'company': {
                'id': company_id,
                'name': company_name,
                'email': company_email
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error updating user company: {str(e)}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

def load_users():
    """Load users from JSON file"""
    try:
        users_file = os.path.join(os.path.dirname(__file__), 'data', 'users.json')
        if os.path.exists(users_file):
            with open(users_file, 'r') as f:
                return json.load(f)
        return {}
    except Exception as e:
        app.logger.error(f"Error loading users: {str(e)}")
        return {}

def save_users(users):
    """Save users to JSON file"""
    try:
        users_dir = os.path.join(os.path.dirname(__file__), 'data')
        os.makedirs(users_dir, exist_ok=True)
        users_file = os.path.join(users_dir, 'users.json')
        with open(users_file, 'w') as f:
            json.dump(users, f, indent=2)
    except Exception as e:
        app.logger.error(f"Error saving users: {str(e)}")

@app.route('/update_company', methods=['POST'])
@app.route('/api/user/update-company', methods=['POST'])
@login_required
def update_company():
    """Update the current user's company from product pages"""
    if not request.is_json:
        return jsonify({'status': 'error', 'message': 'Request must be JSON'}), 400
    
    data = request.get_json()
    company_id = data.get('company_id')
    company_name = data.get('company_name')
    company_email = data.get('company_email')
    
    if not all([company_id, company_name, company_email]):
        return jsonify({'status': 'error', 'message': 'Company ID, name, and email are required'}), 400
    
    try:
        # Update user's company in the database
        if MONGO_AVAILABLE and USE_MONGO and users_col is not None:
            # Update or create in MongoDB
            # Ensure we target the correct user document and avoid inserting duplicates
            from bson import ObjectId
            try:
                user_filter = {'_id': ObjectId(current_user.id)} if ObjectId.is_valid(str(current_user.id)) else {'_id': current_user.id}
            except Exception:
                user_filter = {'_id': current_user.id}

            # First, check if the user exists and handle the username_lower field
            user = users_col.find_one(user_filter)
            update_data = {
                'company_id': company_id,
                'company_name': company_name,
                'company_email': company_email,
                'updated_at': datetime.utcnow()
            }
            
            # If user exists, update the document
            if user:
                # If username_lower is missing or null, set a default value to avoid index conflicts
                if 'username_lower' not in user or user.get('username_lower') is None:
                    update_data['username_lower'] = str(user.get('username', '')).lower() or f'user_{current_user.id}'.lower()
                
                # Update the document
                result = users_col.update_one(
                    user_filter,
                    {'$set': update_data}
                )
            else:
                # If user doesn't exist, try to find by email
                if hasattr(current_user, 'email') and current_user.email:
                    user = users_col.find_one({'email': current_user.email})
                    if user:
                        # Update the found user
                        if 'username_lower' not in user or user.get('username_lower') is None:
                            update_data['username_lower'] = str(user.get('username', '')).lower() or f'user_{user["_id"]}'.lower()
                        
                        result = users_col.update_one(
                            {'_id': user['_id']},
                            {'$set': update_data}
                        )
                    else:
                        # If no user found by email, create a new one with required fields
                        update_data.update({
                            '_id': current_user.id,
                            'email': current_user.email,
                            'username': getattr(current_user, 'username', f'user_{current_user.id}'),
                            'username_lower': getattr(current_user, 'username', f'user_{current_user.id}').lower(),
                            'created_at': datetime.utcnow()
                        })
                        users_col.insert_one(update_data)
                        result = type('obj', (object,), {'matched_count': 1})  # Mock result object
        else:
            # Update in JSON file
            users = load_users()
            user_id = str(current_user.id)
            if user_id not in users:
                users[user_id] = {}
                
            users[user_id]['company_id'] = company_id
            users[user_id]['company_name'] = company_name
            users[user_id]['company_email'] = company_email
            users[user_id]['updated_at'] = datetime.utcnow().isoformat()
            save_users(users)
        
        # Update session with company information
        session['company_id'] = company_id
        session['company_name'] = company_name
        session['company_email'] = company_email
        session['selected_company'] = {
            'id': company_id,
            'name': company_name,
            'email': company_email
        }
        session.modified = True  # Ensure session is saved
        
        return jsonify({
            'status': 'success',
            'message': 'Company updated successfully',
            'company': {
                'id': company_id,
                'name': company_name,
                'email': company_email
            }
        })
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        app.logger.error(f"Error updating company: {str(e)}\n{error_trace}")
        
        # Prepare error details for the response
        error_details = {
            'status': 'error',
            'message': 'Failed to update company information.',
            'error': str(e),
            'error_type': type(e).__name__
        }
        
        # Add more context based on error type
        if 'MongoDB' in error_details['error_type'] or 'pymongo' in error_details['error_type']:
            error_details['message'] = 'Database connection error. Please try again later.'
            
        # Log the full error for debugging
        app.logger.error(f"Returning error response: {error_details}")
        
        return jsonify(error_details), 500

# ---------------------------------------------------------------------------
# Company and Machine Creation Routes
# ---------------------------------------------------------------------------

@app.route('/add_company')
@login_required
def add_company():
    """Render form page to add a new company"""
    return render_template('add_company.html')


@app.route('/add_machine')
@login_required
def add_machine():
    """Render form page to add a new machine"""
    return render_template('add_machine.html')


# ----------------------------- API Endpoints ------------------------------

@app.route('/api/add_company', methods=['POST'])
@login_required
def api_add_company():
    """Handle AJAX request to create a new company"""
    if not request.is_json:
        return jsonify({'success': False, 'message': 'Invalid request, JSON expected.'}), 400

    data = request.get_json()
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()

    if not name or not email:
        return jsonify({'success': False, 'message': 'Name and email are required.'}), 400

    try:
        # Check for existing company with same name or email
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            # Check for existing company in MongoDB
            existing_company = mongo_db.companies.find_one({
                '$or': [
                    {'name': name},
                    {'email': email}
                ]
            })
            
            if existing_company:
                return jsonify({
                    'success': False, 
                    'message': 'A company with this name or email already exists.'
                }), 400
                
            # Insert new company
            result = mongo_db.companies.insert_one({
                'name': name, 
                'email': email,
                'created_at': datetime.utcnow(),
                'created_by': str(current_user.id)
            })
            company_id = str(result.inserted_id)
        else:
            # JSON fallback implementation
            companies_file = os.path.join(app.root_path, 'static', 'data', 'company_emails.json')
            os.makedirs(os.path.dirname(companies_file), exist_ok=True)
            
            # Load existing companies
            companies = []
            if os.path.exists(companies_file):
                with open(companies_file, 'r', encoding='utf-8') as f:
                    companies = json.load(f) or []
            
            # Check for duplicates
            if any(company.get('Company Name') == name or company.get('EmailID') == email 
                  for company in companies):
                return jsonify({
                    'success': False, 
                    'message': 'A company with this name or email already exists.'
                }), 400
            
            # Add new company
            company_id = str(len(companies) + 1)
            companies.append({
                'id': company_id,
                'Company Name': name,
                'EmailID': email,
                'created_at': datetime.utcnow().isoformat(),
                'created_by': str(current_user.id)
            })
            
            # Save back to file
            with open(companies_file, 'w', encoding='utf-8') as f:
                json.dump(companies, f, ensure_ascii=False, indent=2)

        # Log environment variables for debugging (sensitive values masked)
        app.logger.info("Environment variables for email configuration:")
        app.logger.info(f"SMTP_HOST: {os.getenv('SMTP_HOST', 'Not set')}")
        app.logger.info(f"SMTP_PORT: {os.getenv('SMTP_PORT', 'Not set')}")
        app.logger.info(f"EMAIL_USER: {'Set' if os.getenv('EMAIL_USER') else 'Not set'}")
        app.logger.info(f"EMAIL_PASS: {'Set' if os.getenv('EMAIL_PASS') else 'Not set'}")
        app.logger.info(f"ADMIN_ALERT_EMAIL: {ADMIN_ALERT_EMAIL}")

        # Send alert email and handle the result
        user_identity = getattr(current_user, 'email', getattr(current_user, 'username', 'Unknown User'))
        email_sent = send_alert_email(
            subject='Database Update: New Company Added',
            body=f"{user_identity} added a new company ({name}, {email}) on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC"
        )
        
        if email_sent:
            app.logger.info("Notification email sent successfully")
            return jsonify({
                'success': True, 
                'message': 'Company added successfully. Notification email sent.', 
                'id': company_id
            })
        else:
            app.logger.warning("Company added but failed to send notification email")
            return jsonify({
                'success': True, 
                'message': 'Company added successfully. Failed to send notification email.',
                'id': company_id,
                'warning': 'Email notification failed'
            })
        
    except Exception as e:
        app.logger.error(f"Error adding company: {e}", exc_info=True)
        return jsonify({
            'success': False, 
            'message': 'An error occurred while adding the company. Please try again.'
        }), 500
        return jsonify({'success': False, 'message': 'Failed to add company.'}), 500


@app.route('/api/add_machine', methods=['POST'])
@login_required
def api_add_machine():
    """Handle AJAX request to create a new machine"""
    if not request.is_json:
        return jsonify({'success': False, 'message': 'Invalid request, JSON expected.'}), 400

    data = request.get_json()
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()

    if not name:
        return jsonify({'success': False, 'message': 'Machine name is required.'}), 400

    try:
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            # Store machines in a single document that contains an array field `machines`
            # Find the document that holds the array (first document that has `machines`)
            master_doc = mongo_db.machine.find_one({'machines': {'$exists': True}})
            if master_doc is None:
                # Create master doc if it doesn't exist
                next_id = 1
                mongo_db.machine.insert_one({'machines': [{'id': next_id, 'name': name}]})
            else:
                machines_arr = master_doc.get('machines', [])
                # Check if machine with this name already exists
                if any(m.get('name') == name for m in machines_arr):
                    return jsonify({'success': False, 'message': 'A machine with this name already exists.'}), 400
                    
                # Determine next incremental id based on existing array length / max id
                if machines_arr:
                    next_id = max([m.get('id', 0) for m in machines_arr]) + 1
                else:
                    next_id = 1
                mongo_db.machine.update_one(
                    {'_id': master_doc['_id']},
                    {'$push': {'machines': {'id': next_id, 'name': name, 'description': description, 'created_at': datetime.utcnow()}}},
                    upsert=True
                )
            machine_id = str(next_id)
            # Send alert email
            user_identity = getattr(current_user, 'email', getattr(current_user, 'username', 'Unknown User'))
            send_alert_email(
                subject='Database Update: New Machine Added',
                body=f"{user_identity} added a new machine ({name}) on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}"
            )
        else:
            # File-based storage fallback
            os.makedirs(os.path.dirname(machines_file), exist_ok=True)
            machines_data = {"machines": []}
            if os.path.exists(machines_file):
                with open(machines_file, 'r', encoding='utf-8') as f:
                    machines_data = json.load(f) or {"machines": []}
            
            machines = machines_data.get('machines', [])
            
            # Check if machine with this name already exists
            if any(m.get('name') == name for m in machines):
                return jsonify({'success': False, 'message': 'A machine with this name already exists.'}), 400

            # Determine next ID
            next_id = (machines[-1]['id'] + 1) if machines else 1
            machines.append({
                'id': next_id, 
                'name': name, 
                'description': description,
                'created_at': datetime.utcnow().isoformat()
            })
            machines_data['machines'] = machines
            with open(machines_file, 'w', encoding='utf-8') as f:
                json.dump(machines_data, f, ensure_ascii=False, indent=2)

        return jsonify({'success': True, 'message': 'Machine added successfully.', 'id': machine_id})
    except Exception as e:
        app.logger.error(f"Error adding machine: {e}")
        return jsonify({'success': False, 'message': 'Failed to add machine.'}), 500

# Step 1: Request Password Reset - Send OTP to email
# Step 2: Verify OTP
@app.route('/api/auth/request-password-reset', methods=['POST'])
def api_request_password_reset():
    data = request.get_json()
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify({'error': 'Email is required'}), 400

    # Find user by email
    user = None
    if MONGO_AVAILABLE and USE_MONGO:
        doc = mu_find_user_by_email_or_username(email)
        if doc and doc.get('email', '').lower() == email:
            user = doc
    else:
        for u in users.values():
            if u.email.lower() == email:
                user = u
                break

    if not user:
        # Don't reveal if email exists for security
        return jsonify({'success': True, 'message': 'If an account with that email exists, a password reset OTP has been sent.'})

    # Generate OTP
    otp = ''.join(random.choices('0123456789', k=6))
    otp_expiry = datetime.utcnow() + timedelta(minutes=10)

    # Store OTP in user's record
    if MONGO_AVAILABLE and USE_MONGO:
        users_col.update_one(
            {'_id': user['_id']},
            {'$set': {
                'reset_token': otp,
                'reset_token_expiry': otp_expiry
            }}
        )
    else:
        user.reset_token = otp
        user.reset_token_expiry = otp_expiry
        save_users()

    # Send email with OTP
    try:
        msg = MIMEMultipart()
        msg['From'] = f'"{EMAIL_FROM_NAME}" <{EMAIL_FROM}>'
        msg['To'] = email
        msg['Subject'] = 'Password Reset OTP'
        
        body = f"""
        <h2>Password Reset Request</h2>
        <p>You have requested to reset your password. Please use the following OTP to proceed:</p>
        <h3 style="font-size: 24px; letter-spacing: 5px; margin: 20px 0;">{otp}</h3>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
        """
        
        msg.attach(MIMEText(body, 'html'))
        
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
            
        return jsonify({
            'success': True, 
            'message': 'If an account with that email exists, a password reset OTP has been sent.'
        })
    except Exception as e:
        app.logger.error(f'Error sending password reset email: {str(e)}')
        return jsonify({'error': 'Failed to send password reset email. Please try again later.'}), 500

@app.route('/api/auth/verify-reset-otp', methods=['POST'])
def api_verify_reset_otp():
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        otp = data.get('otp', '').strip()

        if not all([email, otp]):
            return jsonify({'error': 'Email and OTP are required'}), 400

        user = None
        if MONGO_AVAILABLE and USE_MONGO:
            doc = mu_find_user_by_email_or_username(email)
            if doc and doc.get('email', '').lower() == email:
                user = doc
        else:
            for u in users.values():
                if u.email.lower() == email:
                    user = u
                    break

        if not user:
            return jsonify({'error': 'No account found with that email'}), 404

        stored_otp = user.get('reset_token') if isinstance(user, dict) else user.reset_token
        stored_expiry = user.get('reset_token_expiry') if isinstance(user, dict) else user.reset_token_expiry

        if not stored_otp or stored_otp != otp:
            return jsonify({'error': 'Invalid OTP'}), 400

        if stored_expiry and stored_expiry < datetime.utcnow():
            return jsonify({'error': 'OTP has expired'}), 400

        return jsonify({'success': True, 'message': 'OTP verified successfully'})

    except Exception as e:
        print(f"OTP verification error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/reset-password', methods=['POST'])
def api_reset_password():
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        otp = data.get('otp', '').strip()
        new_password = data.get('new_password', '').strip()
        
        if not all([email, otp, new_password]):
            return jsonify({'error': 'Email, OTP, and new password are required'}), 400
            
        print(f"Resetting password for email: {email}")
            
        # Find user by email
        user = None
        if MONGO_AVAILABLE and USE_MONGO:
            print("Looking up user in MongoDB...")
            doc = mu_find_user_by_email_or_username(email)
            if doc and doc.get('email', '').lower() == email:
                user = doc
                print(f"User found in MongoDB: {user['email']} (ID: {user['_id']})")
        else:
            # Fallback to JSON storage
            for u in users.values():
                if u.email.lower() == email:
                    user = u
                    break
                
        if not user:
            print(f"No user found with email: {email}")
            return jsonify({'error': 'No account found with that email'}), 404
            
        # Verify OTP
        stored_otp = user.get('reset_token') if isinstance(user, dict) else user.reset_token
        stored_expiry = user.get('reset_token_expiry') if isinstance(user, dict) else user.reset_token_expiry
        
        print(f"Verifying OTP - Stored: {stored_otp}, Provided: {otp}")
        
        if not stored_otp or stored_otp != otp:
            print("Invalid OTP")
            return jsonify({'error': 'Invalid OTP'}), 400
            
        if stored_expiry and stored_expiry < datetime.utcnow():
            print("OTP expired")
            return jsonify({'error': 'OTP has expired'}), 400
            
        # Update password
        if MONGO_AVAILABLE and USE_MONGO:
            print(f"Updating password for user {user['_id']}")
            # Create a new User instance to use its password hashing
            temp_user = User(
                id=str(user['_id']),
                email=user['email'],
                username=user['username'],
                password_hash=user.get('password_hash', '')
            )
            temp_user.set_password(new_password)
            
            # Update the user in MongoDB
            users_col.update_one(
                {'_id': user['_id']},
                {'$set': {
                    'password_hash': temp_user.password_hash,
                    'reset_token': None,
                    'reset_token_expiry': None
                }}
            )
            print("Password updated successfully in MongoDB")
        else:
            # Fallback to JSON storage
            user.set_password(new_password)
            user.reset_token = None
            user.reset_token_expiry = None
            save_users()
        
        return jsonify({
            'success': True,
            'message': 'Password has been reset successfully',
            'redirectTo': '/login'  # Redirect to login page after successful reset
        })
        
    except Exception as e:
        print(f"Password reset error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/quotation_preview')
@login_required
@company_required
def quotation_preview():
    app.logger.info("[DEBUG] quotation_preview() called")
    
    # Get current date and time
    current_datetime = datetime.now()
    quote_date = current_datetime.strftime('%d-%m-%Y')
    quote_time = current_datetime.strftime('%H:%M:%S')
    
    cart = get_user_cart()
    app.logger.info(f"[DEBUG] Cart contains {len(cart.get('products', []))} products")
    
    if not cart.get('products'):
        app.logger.warning("[DEBUG] Empty cart, redirecting to cart page")
        flash('Your cart is empty', 'warning')
        return redirect(url_for('cart'))

    # Get company info from selected_company dict first, then fallback to direct session values
    selected_company = session.get('selected_company', {})
    app.logger.info(f"[DEBUG] Selected company from session: {selected_company}")
    
    customer_name = selected_company.get('name') or session.get('company_name', '')
    customer_email = selected_company.get('email') or session.get('company_email', '')
    app.logger.info(f"[DEBUG] Resolved customer: {customer_name} <{customer_email}>")
    
    # If we have company ID but no name/email, try to look it up
    if not customer_name and 'company_id' in session:
        try:
            company_id = session['company_id']
            file_path = os.path.join(app.root_path, 'static', 'data', 'company_emails.json')
            with open(file_path, 'r') as f:
                companies = json.load(f)
            
            company = next((c for c in companies if str(c.get('id')) == str(company_id)), None)
            if company:
                customer_name = company.get('Company Name', customer_name)
                customer_email = company.get('EmailID', customer_email)
        except Exception as e:
            app.logger.error(f"Error looking up company info: {str(e)}")
    
    # Ensure values are stored in both places for consistency
    if customer_name or customer_email:
        if not isinstance(selected_company, dict):
            selected_company = {}
        
        if customer_name:
            selected_company['name'] = customer_name
            session['company_name'] = customer_name
        if customer_email:
            selected_company['email'] = customer_email
            session['company_email'] = customer_email
        
        session['selected_company'] = selected_company

    # Ensure all items have required fields and calculate subtotal
    subtotal = 0
    for item in cart.get('products', []):
        # Ensure all required fields exist with defaults
        item.setdefault('type', '')
        item.setdefault('quantity', 1)
        item.setdefault('discount_percent', 0)
        item.setdefault('gst_percent', 18)  # Default GST for mpack
        item.setdefault('unit_price', 0)
        item.setdefault('base_price', 0)
        item.setdefault('bar_price', 0)
        
        if item['type'] == 'mpack':
            # Calculate mpack total matching cart template's approach
            price = float(item['unit_price'])
            quantity = int(item['quantity'])
            discount_percent = float(item['discount_percent'])
            gst_percent = float(item['gst_percent'])
            
            subtotal = price * quantity
            discount_amount = (subtotal * discount_percent / 100) if discount_percent else 0
            price_after_discount = subtotal - discount_amount
            gst_amount = (price_after_discount * gst_percent / 100) if gst_percent else 0
            final_total = price_after_discount + gst_amount
            
            # Store calculations in the item
            item['calculations'] = {
                'unit_price': round(price, 2),
                'quantity': quantity,
                'subtotal': round(subtotal, 2),
                'discount_percent': discount_percent,
                'discount_amount': round(discount_amount, 2),
                'price_after_discount': round(price_after_discount, 2),
                'gst_percent': gst_percent,
                'gst_amount': round(gst_amount, 2),
                'final_total': round(final_total, 2)
            }
            item_subtotal = final_total
            
        elif item['type'] == 'blanket':
            # Calculate blanket total matching cart template's approach
            base_price = float(item.get('base_price', 0))
            bar_price = float(item.get('bar_price', 0))
            quantity = int(item.get('quantity', 1))
            discount_percent = float(item.get('discount_percent', 0))
            gst_percent = float(item.get('gst_percent', 18))
            
            # Calculate unit price as base + bar price
            unit_price = base_price + bar_price
            
            # Calculate subtotal (unit price * quantity)
            subtotal = unit_price * quantity
            
            # Calculate discount amount
            discount_amount = (subtotal * discount_percent / 100) if discount_percent else 0
            
            # Apply discount to get discounted subtotal
            discounted_subtotal = subtotal - discount_amount
            
            # Calculate GST on discounted amount
            gst_amount = (discounted_subtotal * gst_percent / 100)
            
            # Final total after discount and GST
            final_total = discounted_subtotal + gst_amount
            
            # Store calculations in the item
            item['calculations'] = {
                'base_price': round(base_price, 2),
                'bar_price': round(bar_price, 2),
                'unit_price': round(unit_price, 2),
                'quantity': quantity,
                'subtotal': round(subtotal, 2),
                'discount_percent': discount_percent,
                'discount_amount': round(discount_amount, 2),
                'discounted_subtotal': round(subtotal - discount_amount, 2),
                'gst_percent': gst_percent,
                'gst_amount': round(gst_amount, 2),
                'final_total': round(final_total, 2)
            }
            item_subtotal = final_total
            
        else:
            # Handle other product types
            price = float(item.get('unit_price', 0))
            quantity = int(item.get('quantity', 1))
            discount_percent = float(item.get('discount_percent', 0))
            gst_percent = float(item.get('gst_percent', 12))
            
            subtotal = price * quantity
            discount_amount = (subtotal * discount_percent / 100) if discount_percent else 0
            discounted_subtotal = subtotal - discount_amount
            gst_amount = (discounted_subtotal * gst_percent / 100) if gst_percent else 0
            final_total = discounted_subtotal + gst_amount
            
            item['calculations'] = {
                'unit_price': round(price, 2),
                'quantity': quantity,
                'subtotal': round(subtotal, 2),
                'discount_percent': discount_percent,
                'discount_amount': round(discount_amount, 2),
                'gst_percent': gst_percent,
                'gst_amount': round(gst_amount, 2),
                'final_total': round(final_total, 2)
            }
            item_subtotal = final_total
        
        subtotal += item_subtotal
    
    # Calculate final totals with appropriate tax rates and discounts
    subtotal_blankets = 0
    subtotal_mpacks = 0
    discount_blankets = 0
    discount_mpacks = 0
    
    for item in cart.get('products', []):
        item_calc = item.get('calculations', {})
        item_subtotal = item_calc.get('subtotal', 0)
        item_discount = item_calc.get('discount_amount', 0)
        
        if item.get('type') == 'blanket':
            subtotal_blankets += item_subtotal
            discount_blankets += item_discount
        else:  # Assume mpacks for other types
            subtotal_mpacks += item_subtotal
            discount_mpacks += item_discount
    
    # Calculate amounts after discount
    subtotal_after_discount_blankets = max(0, subtotal_blankets - discount_blankets)
    subtotal_after_discount_mpacks = max(0, subtotal_mpacks - discount_mpacks)
    
    # Calculate GST for each category (on discounted amount)
    gst_blankets = subtotal_after_discount_blankets * 0.18  # 18% GST for blankets
    gst_mpacks = subtotal_after_discount_mpacks * 0.12      # 12% GST for mpacks
    
    # Calculate final totals
    subtotal_before_discount = subtotal_blankets + subtotal_mpacks
    total_discount = discount_blankets + discount_mpacks
    subtotal_after_discount = subtotal_after_discount_blankets + subtotal_after_discount_mpacks
    total_gst = gst_blankets + gst_mpacks
    total = subtotal_after_discount + total_gst
    
    # Round to 2 decimal places for display
    subtotal_before_discount = round(subtotal_before_discount, 2)
    total_discount = round(total_discount, 2)
    subtotal_after_discount = round(subtotal_after_discount, 2)
    total = round(total, 2)
    total_gst = round(total_gst, 2)

    # Ensure session is saved before rendering the template
    session.modified = True
    
    # Calculate cart_total as the subtotal before taxes
    cart_total = final_subtotal
    
    context = {
        'cart': cart,
        'quote_date': quote_date,
        'quote_time': quote_time,
        'company_name': customer_name,
        'company_email': customer_email,
        'now': current_datetime,  # Add current datetime object for the template
        'calculations': {
            'subtotal_before_discount': subtotal_before_discount,
            'total_discount': total_discount,
            'subtotal_after_discount': subtotal_after_discount,
            'total': total,
            'gst_breakdown': {
                'blankets': {
                    'subtotal': round(subtotal_blankets, 2),
                    'discount': round(discount_blankets, 2),
                    'subtotal_after_discount': round(subtotal_after_discount_blankets, 2),
                    'gst': round(gst_blankets, 2),
                    'rate': 18
                },
                'mpacks': {
                    'subtotal': round(subtotal_mpacks, 2),
                    'discount': round(discount_mpacks, 2),
                    'subtotal_after_discount': round(subtotal_after_discount_mpacks, 2),
                    'gst': round(gst_mpacks, 2),
                    'rate': 12
                },
                'total_gst': round(total_gst, 2)
            }
        },
        'cart_total': subtotal_after_discount  # cart_total is the subtotal after discount but before taxes
    }
    
    return render_template('quotation.html', **context)

# ---------------------------------------------------------------------------
# Send Quotation Route
# ---------------------------------------------------------------------------
@app.route('/send_quotation', methods=['POST'])
@login_required
@company_required
def send_quotation():
    """Generate quotation from current cart and email it to customer and CGI."""
    try:
        # Parse optional notes from request body
        data = request.get_json() or {}
        notes = (data.get('notes') or '').strip()

        # Fetch cart
        cart = get_user_cart()
        products = cart.get('products', [])
    except Exception as e:
        app.logger.error(f"Error fetching cart or parsing data: {str(e)}")
        return jsonify({
            'error': f'Failed to fetch cart or parse data: {str(e)}',
            'details': str(e)
        }), 500

    try:
        if not products:
            return jsonify({'error': 'Cart is empty'}), 400

        # Get company info with proper fallbacks - prioritize database over session
        customer_name = 'Not specified'
        customer_email = ''
        
        # First try to get from user's company_id if available
        if hasattr(current_user, 'company_id') and current_user.company_id:
            customer_name = get_company_name_by_id(current_user.company_id)
            customer_email = get_company_email_by_id(current_user.company_id)
        
        # If not found in user's company_id, try session
        if customer_name == 'Not specified' or not customer_email:
            selected_company = session.get('selected_company', {})
            if not isinstance(selected_company, dict):
                selected_company = {}
            
            # Get from session if available
            if not customer_email:
                customer_email = (
                    selected_company.get('email') or 
                    session.get('company_email') or 
                    (hasattr(current_user, 'email') and current_user.email) or 
                    ''
                )
            
            if customer_name == 'Not specified':
                customer_name = (
                    selected_company.get('name') or 
                    session.get('company_name') or 
                    (hasattr(current_user, 'company_name') and current_user.company_name) or 
                    'Not specified'
                )
        
        # Final fallback to user's email if still no email
        if not customer_email and hasattr(current_user, 'email'):
            customer_email = current_user.email
        
        if not customer_email:
            return jsonify({'error': 'Customer email is required'}), 400
            
        # Update session with the latest values
        if customer_name and customer_name != 'Not specified':
            # Update user's company info in database if using MongoDB
            if MONGO_AVAILABLE and USE_MONGO and hasattr(current_user, 'id'):
                try:
                    users_col.update_one(
                        {'_id': current_user.id},
                        {'$set': {
                            'company_name': customer_name,
                            'company_email': customer_email,
                            'company_id': current_user.company_id if hasattr(current_user, 'company_id') else None
                        }}
                    )
                except Exception as e:
                    app.logger.error(f"Error updating user's company info: {str(e)}")
            
            # Update session
            session['company_name'] = customer_name
            session['company_email'] = customer_email
            session['selected_company'] = {
                'name': customer_name,
                'email': customer_email,
                'id': current_user.company_id if hasattr(current_user, 'company_id') else session.get('company_id', '')
            }
            session.modified = True

        # Send to customer, operations email, and current user (remove duplicates)
        user_email = current_user.email if hasattr(current_user, 'email') else None
        recipients = list({email for email in [customer_email, 'operations@chemo.in', user_email] if email})

        # Get current date
        today = datetime.utcnow().strftime('%d/%m/%Y')

        # Table rows with header
        rows_html = """
        <table style='width: 100%; border-collapse: collapse; margin: 20px 0;'>
            <thead>
                <tr style='background-color: #1a5276; color: white;'>
                    <th style='padding: 10px; text-align: left;'>Item</th>
                    <th style='padding: 10px; text-align: left;'>Machine</th>
                    <th style='padding: 10px; text-align: left;'>Product</th>
                    <th style='padding: 10px; text-align: left;'>Type</th>
                    <th style='padding: 10px; text-align: left;'>Thickness</th>
                    <th style='padding: 10px; text-align: left;'>Size</th>
                    <th style='padding: 10px; text-align: left;'>Barri...</th>
                    <th style='padding: 10px; text-align: right;'>Qty</th>
                    <th style='padding: 10px; text-align: right;'>Price</th>
                </tr>
            </thead>
            <tbody>
        """
        
        subtotal = 0
        for idx, p in enumerate(products, start=1):
            machine = p.get('machine', '')
            prod_type = p.get('type', '')
            
            # Dimensions
            if p.get('size'):
                dimensions = p['size']
            else:
                length = p.get('length') or ''
                width = p.get('width') or ''
                unit = p.get('unit', '')
                dimensions = f"{length} x {width} {unit}" if length and width else '----'
            
            qty = p.get('quantity', 1)
            
            # Calculate total based on product type
            if prod_type == 'mpack':
                # Always recalculate MPack totals to ensure fresh values after quantity changes
                unit_price = float(p.get('unit_price', 0))
                discount_percent = float(p.get('discount_percent', 0))
                gst_percent = float(p.get('gst_percent', 12))  # 12% GST for MPack

                subtotal_val = unit_price * qty
                discount_amount = (subtotal_val * discount_percent / 100) if discount_percent else 0
                taxable_amount = subtotal_val - discount_amount
                gst_amount = taxable_amount * gst_percent / 100
                total_val = taxable_amount + gst_amount

                # Update (or create) calculations dict so subsequent routes remain consistent
                p['calculations'] = {
                    'unit_price': round(unit_price, 2),
                    'quantity': qty,
                    'discount_percent': discount_percent,
                    'discount_amount': round(discount_amount, 2),
                    'taxable_amount': round(taxable_amount, 2),
                    'gst_percent': gst_percent,
                    'gst_amount': round(gst_amount, 2),
                    'final_total': round(total_val, 2)
                }
                
            elif prod_type == 'blanket':
                # Always recalculate Blanket totals as well
                base_price = float(p.get('base_price', 0))
                bar_price = float(p.get('bar_price', 0))
                unit_price = base_price + bar_price
                discount_percent = float(p.get('discount_percent', 0))
                gst_percent = float(p.get('gst_percent', 18))

                subtotal_val = unit_price * qty
                discount_amount = subtotal_val * discount_percent / 100 if discount_percent else 0
                taxable_amount = subtotal_val - discount_amount
                gst_amount = taxable_amount * gst_percent / 100
                total_val = taxable_amount + gst_amount

                # Sync calculations back to product
                p['calculations'] = {
                    'unit_price': round(unit_price, 2),
                    'quantity': qty,
                    'discount_percent': discount_percent,
                    'discount_amount': round(discount_amount, 2),
                    'taxable_amount': round(taxable_amount, 2),
                    'gst_percent': gst_percent,
                    'gst_amount': round(gst_amount, 2),
                    'final_total': round(total_val, 2)
                }
            
            subtotal += total_val
            
            rows_html += f"""
                <tr>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{idx}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{machine}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{prod_type if prod_type else '----'}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{p.get('name', '----') if prod_type == 'blanket' else '----'}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{p.get('thickness', '----')}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{dimensions}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{p.get('bar_type', '----') if prod_type == 'blanket' else '----'}</td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd;'>{qty}</td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd;'>₹{p.get('unit_price', p.get('base_price', 0)):,.2f}</td>
                </tr>
            """
        
        # Close the table
        rows_html += """
            </tbody>
        </table>
        <p>For more information, please contact: <a href='mailto:info@chemo.in'>info@chemo.in</a></p>
        <p>This quotation is not a contract or invoice. It is our best estimate.</p>
        """

        # Generate a unique quote ID
        quote_id = f"CGI-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"

        # Build email content with improved table layout and consistent white background
        email_content = f"""
        <div style='font-family: Arial, sans-serif; color: #333; max-width: 1200px; margin: 0 auto; line-height: 1.6; background-color: #e0caa9; padding: 20px;'>
          <div style='background-color: white; border-radius: 0.5rem; box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075); padding: 2rem; margin-bottom: 1.5rem;'>
            <div style='text-align: center; margin-bottom: 2rem;'>
              <img src='https://i.ibb.co/1GVLnJcc/image-2025-07-04-163516213.png' alt='CGI Logo' style='max-width: 200px; margin-bottom: 1rem;'>
              <h2 style='margin: 0 0 0.5rem 0; color: #2c3e50;'>QUOTATION</h2>
              <p style='color: #6c757d; margin: 0; font-size: 0.9rem;'>{today}</p>
            </div>
            
            <div style='display: flex; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 2rem;'>
              <!-- Company Information -->
              <div style='flex: 1; min-width: 300px; border: 1px solid #dee2e6; border-radius: 0.25rem; overflow: hidden; background-color: white;'>
                <div style='background-color: #f8f9fa; padding: 0.75rem 1.25rem; border-bottom: 1px solid rgba(0,0,0,0.125); display: flex; justify-content: space-between; align-items: center;'>
                  <h5 style='margin: 0; font-size: 1rem;'>Company Information</h5>
                  <span style='background-color: #198754; color: white; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 10px;'>Verified</span>
                </div>
                <div style='padding: 1.25rem; height: 100%; display: flex; flex-direction: column;'>
                  <div style='flex: 1;'>
                    <div style='margin-bottom: 1rem;'>
                      <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Company Name</div>
                      <div style='font-weight: 600;'>CGI - Chemo Graphics INTERNATIONAL</div>
                    </div>
                    <div style='margin-bottom: 1rem;'>
                      <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Address</div>
                      <div>113, 114 High Tech Industrial Centre,<br>Caves Rd, Jogeshwari East,<br>Mumbai, Maharashtra 400060</div>
                    </div>
                    <div style='margin-bottom: 1rem;'>
                      <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Email</div>
                      <div><a href='mailto:info@chemo.in' style='color: #0d6efd; text-decoration: none;'>info@chemo.in</a></div>
                    </div>
                  </div>
                  <div style='padding-top: 1rem; margin-top: auto; border-top: 1px solid #e9ecef;'>
                    <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Prepared by:</div>
                    <div style='font-weight: 600;'>{current_user.username}</div>
                    <div><a href='mailto:{current_user.email}' style='color: #0d6efd; text-decoration: none;'>{current_user.email}</a></div>
                  </div>
                </div>
              </div>
              
              <!-- Customer Information -->
              <div style='flex: 1; min-width: 300px; border: 1px solid #dee2e6; border-radius: 0.25rem; overflow: hidden; background-color: white;'>
                <div style='background-color: #f8f9fa; padding: 0.75rem 1.25rem; border-bottom: 1px solid rgba(0,0,0,0.125); display: flex; justify-content: space-between; align-items: center;'>
                  <h5 style='margin: 0; font-size: 1rem;'>Customer Information</h5>
                  <span style='background-color: #198754; color: white; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 10px;'>Verified</span>
                </div>
                <div style='padding: 1.25rem; height: 100%; display: flex; flex-direction: column;'>
                  <div style='flex: 1;'>
                    <div style='margin-bottom: 1rem;'>
                      <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Company Name</div>
                      <div style='font-weight: 600;'>{customer_name}</div>
                    </div>
                    <div style='margin-bottom: 1rem;'>
                      <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Email</div>
                      <div><a href='mailto:{customer_email}' style='color: #0d6efd; text-decoration: none;'>{customer_email}</a></div>
                    </div>
                    <div style='margin-bottom: 1rem;'>
                      <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Date</div>
                      <div>{today}</div>
                    </div>
                  </div>
                  <div style='padding-top: 1rem; margin-top: auto; border-top: 1px solid #e9ecef;'>
                    <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Quotation #</div>
                    <div style='font-weight: 600;'>{quote_id}</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div style='margin: 1.5rem 0; border: 1px solid #dee2e6; border-radius: 0.25rem; overflow: hidden;'>
              <div style='background-color: #f8f9fa; padding: 0.75rem 1.25rem; border-bottom: 1px solid rgba(0,0,0,0.125);'>
                <h5 style='margin: 0; font-size: 1rem;'>Quotation Details</h5>
              </div>
              <div style='padding: 1.5rem; background-color: white;'>
                <p style='margin-bottom: 1rem;'>Hello,</p>
                <p style='margin-bottom: 1rem;'>This is {current_user.username} from CGI.</p>
                <p style='margin-bottom: 1.5rem;'>Here is the proposed quotation for the required products:</p>
                {'<p style="margin-bottom: 1.5rem;"><strong>Notes:</strong><br>' + notes + '</p>' if notes else ''}
                
                <div style='overflow-x: auto; margin: 1.5rem 0;'>
{rows_html}
                </div>
                
                <!-- Tax and Total Breakdown -->
                <div style='margin: 2rem 0; display: flex; justify-content: flex-end;'>
                    <div style='width: 50%;'>
                        <table style='width: 100%; border-collapse: collapse;'>
                            <tbody>
                                <tr>
                                    <td style='padding: 8px; text-align: right;'>Sub Total:</td>
                                    <td style='padding: 8px; text-align: right;'>₹{subtotal:,.2f}</td>
                                </tr>
                                <tr>
                                    <td style='padding: 8px; text-align: right;'>Total Taxable Amount:</td>
                                    <td style='padding: 8px; text-align: right;'>₹{subtotal:,.2f}</td>
                                </tr>
                                <tr>
                                    <td style='padding: 8px; text-align: right;'>CGST9 (9%):</td>
                                    <td style='padding: 8px; text-align: right;'>₹{subtotal * 0.09:,.2f}</td>
                                </tr>
                                <tr>
                                    <td style='padding: 8px; text-align: right;'>SGST9 (9%):</td>
                                    <td style='padding: 8px; text-align: right;'>₹{subtotal * 0.09:,.2f}</td>
                                </tr>
                                <tr>
                                    <td style='padding: 8px; text-align: right;'>Rounding:</td>
                                    <td style='padding: 8px; text-align: right;'>{(subtotal * 1.18) % 1:,.2f}</td>
                                </tr>
                                <tr style='border-top: 1px solid #dee2e6; font-weight: bold;'>
                                    <td style='padding: 8px; text-align: right;'>Total:</td>
                                    <td style='padding: 8px; text-align: right;'>₹{subtotal * 1.18:,.2f}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <p style='margin: 2rem 0 1rem 0;'>Thank you for your business!<br>— Team CGI</p>
              </div>
            </div>
            
            <div style='margin-top: 1.5rem; padding: 1rem; background-color: #f8f9fa; border-radius: 0.25rem; text-align: center;'>
              <p style='color: #6c757d; font-size: 0.8rem; margin: 0;'>
                This quotation is not a contract or invoice. It is our best estimate.
              </p>
            </div>
          </div>
        </div>
        """

        # Total is same as subtotal since amounts already include any taxes
        total = subtotal
        

        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
        msg['To'] = ', '.join(recipients)
        msg['Subject'] = f"Quotation from Chemo INTERNATIONAL - {today}"
        
        # Attach HTML version
        part = MIMEText(email_content, 'html')
        msg.attach(part)


        # Initialize email_sent flag
        email_sent = False
        
        # Check if email configuration is valid
        if all([SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD]):
            try:
                # Send the email
                if str(SMTP_PORT) == '465':
                    server = smtplib.SMTP_SSL(SMTP_SERVER, int(SMTP_PORT))
                else:
                    server = smtplib.SMTP(SMTP_SERVER, int(SMTP_PORT))
                    if str(SMTP_PORT) == '587':  # Explicitly use STARTTLS for port 587
                        server.starttls()
                
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(msg)
                server.quit()
                app.logger.info("Quotation email sent successfully")
                email_sent = True
            except Exception as e:
                app.logger.error(f"Failed to send email: {str(e)}")
                email_sent = False
        else:
            app.logger.warning("Email configuration is incomplete. Email will not be sent.")

        # Clear cart after attempting to send email
        clear_cart()
        
        # Instead of removing selected_company, keep it in the session
        # This ensures the company selection persists after sending a quotation
        
        return jsonify({
            'success': True,
            'message': 'Quotation processed successfully',
            'email_sent': email_sent,
            'quote_id': quote_id,
            'company': {
                'id': session.get('selected_company', {}).get('id'),
                'name': session.get('selected_company', {}).get('name'),
                'email': session.get('selected_company', {}).get('email')
            }
        })
    except Exception as e:
        app.logger.error(f"Error sending quotation: {str(e)}")
        return jsonify({
            'error': 'Failed to send quotation',
            'details': str(e)
        }), 500

@app.route('/api/request-otp', methods=['POST'])
def api_request_otp():
    try:
        data = request.get_json()
        email = data.get('email')
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
            
        # Generate OTP
        otp = str(random.randint(100000, 999999))
        
        # Store OTP in user session with proper expiry format
        session['otp'] = otp
        session['otp_expiry'] = (datetime.now() + timedelta(minutes=5)).isoformat()
        
        # Send OTP to email
        if email_config_valid:
            try:
                msg = MIMEMultipart()
                msg['From'] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
                msg['To'] = email
                msg['Subject'] = 'Your OTP for Registration'
                
                body = f"Your OTP is: {otp}\nThis OTP will expire in 5 minutes."
                msg.attach(MIMEText(body, 'plain'))
                
                with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                    server.starttls()
                    server.login(SMTP_USERNAME, SMTP_PASSWORD)
                    server.send_message(msg)
            except Exception as e:
                print(f"Error sending email: {str(e)}")
                return jsonify({'error': 'Failed to send OTP. Please try again later.'}), 500
                
        return jsonify({
            'success': True,
            'message': 'OTP has been sent to your email'
        })
        
    except Exception as e:
        print(f"OTP request error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/verify-otp', methods=['POST'])
def api_verify_otp():
    try:
        data = request.get_json()
        otp = data.get('otp')
        
        if not otp:
            return jsonify({'error': 'OTP is required'}), 400
            
        # Get stored OTP from session
        stored_otp = session.get('otp')
        otp_expiry = session.get('otp_expiry')
        
        if not stored_otp:
            return jsonify({'error': 'No OTP requested. Please request OTP first.'}), 400
            
        if otp_expiry and datetime.now() > datetime.fromisoformat(str(otp_expiry)):
            return jsonify({'error': 'OTP has expired. Please request a new OTP.'}), 400
            
        if otp != stored_otp:
            return jsonify({'error': 'Invalid OTP'}), 401
            
        # Clear OTP from session after successful verification
        session.pop('otp', None)
        session.pop('otp_expiry', None)
        
        return jsonify({
            'success': True,
            'message': 'OTP verified successfully'
        })
        
    except Exception as e:
        print(f"OTP verification error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/register/complete', methods=['POST'])
def api_register_complete():
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        print(f"\n🔍 Registration attempt for: {email} ({username})")
        print(f"MongoDB Status - Available: {MONGO_AVAILABLE}, Using: {USE_MONGO}")
        print(f"Users Collection: {users_col}")
        if users_col is not None:
            print(f"Collection name: {users_col.name}")
            print(f"Database name: {users_col.database.name}")
        
        otp = data.get('otp', '').strip()  # Get OTP if provided

        # Input validation
        if not all([email, username, password]):
            return jsonify({'error': 'Email, username, and password are required'}), 400
            
        print(f'Registration attempt - Email: {email}, Username: {username}')

        if MONGO_AVAILABLE and USE_MONGO:
            try:
                # Check for existing user
                existing_user = mu_find_user_by_email_or_username(email) or mu_find_user_by_email_or_username(username)
                if existing_user:
                    print(f'Registration failed: User already exists with email/username: {email}/{username}')
                    return jsonify({'error': 'Email or username already exists'}), 400
                
                # Create user in MongoDB
                print('Creating new user in MongoDB...')
                print(f'User details - Email: {email}, Username: {username}')
                
                # Debug: Check if we can access the users collection
                print(f'Users collection exists: {users_col is not None}')
                if users_col is not None:
                    print(f'Current users in DB: {users_col.count_documents({})}')
                
                # Create user and retrieve document
                user_id = mu_create_user(email, username, password)
                print(f'User created with ID: {user_id}')
                
                # Try to retrieve user document using both UUID and ObjectId formats
                doc = mu_find_user_by_id(user_id)
                if not doc:
                    try:
                        from bson import ObjectId
                        doc = mu_find_user_by_id(ObjectId(user_id))
                    except Exception as e:
                        print(f"Error retrieving user document: {str(e)}")
                        traceback.print_exc()
                        return jsonify({'error': 'Failed to create user in database'}), 500
                
                print(f'Retrieved user document: {doc is not None}')
                
                if not doc:
                    traceback.print_exc()
                    return jsonify({'error': 'Failed to create user in database'}), 500
                
                new_user = User(
                    id=str(doc['_id']),
                    email=doc['email'],
                    username=doc['username'],
                    password_hash=doc['password_hash'],
                    is_verified=doc.get('is_verified', False),
                    otp_verified=doc.get('otp_verified', False)
                )
                
            except Exception as e:
                print(f"❌ MongoDB Error: {str(e)}")
                traceback.print_exc()
                return jsonify({'error': 'Failed to create user in database'}), 500
        else:
            # Fallback to JSON storage
            print('Using JSON storage fallback')
            users = load_users()
            
            # Check for existing user
            if any(u.email == email or u.username == username for u in users.values()):
                return jsonify({'error': 'Email or username already exists'}), 400
                
            user_id = str(uuid.uuid4())
            new_user = User(user_id, email, username, password)
            new_user.set_password(password)
            users[user_id] = new_user
            
            if not save_users():
                return jsonify({'error': 'Failed to save user data'}), 500

        # Auto-login the newly registered user
        login_user(new_user)
        print(f'User {username} registered and logged in successfully')
        
        return jsonify({
            'success': True,
            'message': 'Registration successful',
            'redirectTo': '/index',  # Redirect to index after successful registration
            'user': {
                'id': new_user.id,
                'email': new_user.email,
                'username': new_user.username
            }
        })
        
    except Exception as e:
        print(f"Registration error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/login', methods=['GET', 'POST', 'OPTIONS'])
def api_login():
    if request.method == 'OPTIONS':
        # Handle preflight request
        response = jsonify({'success': True})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        return response
        
    try:
        # Handle both form data and JSON
        if request.is_json:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'Invalid JSON data'}), 400, {'Content-Type': 'application/json'}
        else:
            data = request.form
            if not data:
                return jsonify({'error': 'Invalid form data'}), 400, {'Content-Type': 'application/json'}

        identifier = (data.get('identifier') or data.get('email') or data.get('username', '')).strip()
        password = (data.get('password') or '').strip()
        
        print(f'Login attempt - Identifier: {identifier}')
        
        if not identifier or not password:
            print('Login failed: Missing identifier or password')
            return jsonify({'error': 'Email/username and password are required'}), 400
            
        if MONGO_AVAILABLE and USE_MONGO:
            try:
                print('\n=== Login Debug ===')
                print(f'MONGO_AVAILABLE: {MONGO_AVAILABLE}, USE_MONGO: {USE_MONGO}')
                print(f'Users collection: {users_col}')
                if users_col is not None:
                    print(f'Collection name: {users_col.name}, DB: {users_col.database.name}')
                
                print('Attempting to find user in MongoDB...')
                # Find user by email or username in Mongo (case-insensitive)
                doc = mu_find_user_by_email_or_username(identifier)
                
                if not doc:
                    print(f'❌ User not found for identifier: {identifier}')
                    # Check if the identifier is an email or username
                    is_email = '@' in identifier
                    if is_email:
                        return jsonify({
                            'error': 'Email not found',
                            'message': 'No account found with this email address. Please check and try again.'
                        }), 401
                    else:
                        return jsonify({
                            'error': 'Username not found',
                            'message': 'No account found with this username. Please check and try again.'
                        }), 401
                    
                print(f'✅ User found in MongoDB:')
                print(f'   Email: {doc.get("email")} (stored in DB)')
                print(f'   Username: {doc.get("username")} (stored in DB)')
                print(f'   ID: {doc.get("_id")}')
                print(f'   Has password_hash: {"password_hash" in doc}')
                
                # Ensure we have the correct case for the username from the DB
                # This ensures we return the exact case that was used during registration
                identifier = doc.get('email', identifier) if '@' in identifier else doc.get('username', identifier)
                
                # Verify password
                print('\nVerifying password...')
                is_password_correct = mu_verify_password(doc, password)
                print(f'Password verification result: {is_password_correct}')
                
                if not is_password_correct:
                    print('❌ Password verification failed')
                    return jsonify({
                        'error': 'Incorrect password',
                        'message': 'The password you entered is incorrect. Please try again.'
                    }), 401
                
                # Create user object
                user = User(
                    id=str(doc['_id']),
                    email=doc['email'],
                    username=doc['username'],
                    password_hash=doc['password_hash'],
                    is_verified=doc.get('is_verified', False),
                    otp_verified=doc.get('otp_verified', False)
                )
                
                print(f'Successfully created user object for login: {user.email} (ID: {user.id})')
                
                # Log the user in
                login_user(user)
                print(f'User {user.username} logged in successfully')
                
                if request.is_json:
                    response = jsonify({
                        'success': True,
                        'message': 'Login successful',
                        'redirectTo': '/index',
                        'user': {
                            'id': str(user.id),
                            'email': user.email,
                            'username': user.username
                        }
                    })
                else:
                    # For form submission, redirect directly
                    return redirect(url_for('index'))
                
                # Set session
                session['user_id'] = str(user.id)
                session['user_email'] = user.email
                session['username'] = user.username
                
                return response
                
            except Exception as e:
                print(f'MongoDB login error: {str(e)}')
                import traceback
                traceback.print_exc()
                return jsonify({'error': 'Authentication service unavailable'}), 500

        # ---------------- JSON fallback path -----------------
        print('Falling back to JSON user storage')
        global users
        users = load_users()
        
        # Check if user exists in our loaded users
        user = None
        for user_id, u in users.items():
            if u.email == identifier or u.username == identifier:
                user = u
                break
                
        if not user:
            # If user not found in loaded users, try to load from file directly
            try:
                with open(USERS_FILE, 'r', encoding='utf-8') as f:
                    all_users = json.load(f)
                
                for user_id, user_data in all_users.items():
                    if user_data.get('email') == identifier or user_data.get('username') == identifier:
                        # Create User object from file data
                        user = User(
                            id=user_id,
                            email=user_data['email'],
                            username=user_data['username'],
                            password_hash=user_data['password_hash'],
                            is_verified=user_data.get('is_verified', False),
                            otp_verified=user_data.get('otp_verified', False)
                        )
                        # Add to our users dictionary
                        users[user_id] = user
                        break
            except Exception as e:
                print(f"Error loading user from file: {str(e)}")
                return jsonify({'error': 'Internal server error'}), 500
                
        if not user:
            print(f'User not found in JSON storage for identifier: {identifier}')
            return jsonify({'error': 'Invalid email/username or password'}), 401
            
        if not user.check_password(password):
            print('Password verification failed for JSON user')
            return jsonify({'error': 'Invalid email/username or password'}), 401
            
        login_user(user)
        print(f'User {user.username} logged in successfully (JSON storage)')
        
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'redirectTo': '/index',  # Changed to use index route
            'user': {
                'id': user.id,
                'email': user.email,
                'username': user.username
            }
        })
        
    except Exception as e:
        print(f"Unexpected login error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'An unexpected error occurred during login'}), 500

@app.route('/api/auth/logout', methods=['GET', 'POST'])
@login_required
def api_logout():
    try:
        logout_user()
        session.clear()  # Clear the session data
        if request.method == 'POST':
            return jsonify({'success': True, 'message': 'Logged out successfully'})
        return redirect(url_for('login'))
    except Exception as e:
        print(f"Logout error: {str(e)}")
        if request.method == 'POST':
            return jsonify({'error': 'Internal server error'}), 500
        flash('An error occurred during logout', 'error')
        return redirect(url_for('home'))

@app.route('/api/auth/user', methods=['GET'])
def api_user():
    try:
        if current_user.is_authenticated:
            user_data = {
                'success': True,
                'user': {
                    'id': current_user.id,
                    'email': current_user.email,
                    'username': current_user.username,
                    'company_id': getattr(current_user, 'company_id', None)
                }
            }
            return jsonify(user_data)
        else:
            return jsonify({'error': 'Not logged in'}), 401
    except Exception as e:
        print(f"User error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/profile/account')
@login_required
def api_profile_account():
    user = current_user
    return jsonify({
        'username': user.username,
        'email': user.email,
        'created_at': user.created_at.strftime('%Y-%m-%d'),
        'company_id': user.company_id,
        'role': user.role if hasattr(user, 'role') else 'user'
    })

@app.route('/api/profile/update', methods=['POST'])
@login_required
def api_profile_update():
    data = request.get_json()
    user_id = current_user.get_id()
    
    if not user_id:
        return jsonify({'error': 'User not found'}), 404
    
    try:
        if MONGO_AVAILABLE and USE_MONGO:
            user = mu_find_user_by_id(user_id)
            if not user:
                return jsonify({'error': 'User not found'}), 404
            
            # Update user fields
            if 'username' in data:
                user['username'] = data['username']
            if 'email' in data:
                user['email'] = data['email']
            
            # Save to MongoDB
            mu_update_user(user_id, user)
            
            return jsonify({'success': True, 'message': 'Profile updated successfully'})
        else:
            return jsonify({'error': 'Database not available'}), 500
            
    except Exception as e:
        app.logger.error(f"Error updating profile: {str(e)}")
        return jsonify({'error': 'Failed to update profile'}), 500

# Product pages
@app.route('/mpacks')
@login_required
@company_required
def mpacks():
    # Get company_id from query parameters
    company_id = request.args.get('company_id')
    
    # Initialize company info
    company_name = ''
    company_email = ''
    
    # If company_id is provided in the URL
    if company_id:
        # Try to get company info by ID
        company_name = get_company_name_by_id(company_id)
        company_email = get_company_email_by_id(company_id)
        
        # Update session with the selected company
        session['selected_company'] = {
            'id': company_id,
            'name': company_name,
            'email': company_email
        }
        session['company_name'] = company_name
        session['company_email'] = company_email
    else:
        # Fall back to session data if no company_id in URL
        selected_company = session.get('selected_company', {})
        company_name = selected_company.get('name') or session.get('company_name')
        company_email = selected_company.get('email') or session.get('company_email')
        company_id = selected_company.get('id') or session.get('company_id')
        
        # Fall back to user's company info if not found
        if not company_name and hasattr(current_user, 'company_name'):
            company_name = current_user.company_name
        if not company_email and hasattr(current_user, 'company_email'):
            company_email = current_user.company_email
        if not company_id and hasattr(current_user, 'company_id'):
            company_id = current_user.company_id
    
    # Update session with final values
    session['company_name'] = company_name
    session['company_email'] = company_email
    session['company_id'] = company_id
            
    # Log the company info being sent to template
    app.logger.info(f"Rendering mpacks with company: {company_name}, email: {company_email}")
    
    response = render_template('products/chemicals/mpack.html', 
                           current_company={
                               'id': company_id,
                               'name': company_name,
                               'email': company_email
                           })
    
    app.logger.info("Template rendered successfully")
    return response

@app.route('/blankets')
@login_required
@company_required
def blankets():
    # Get company_id from query parameters
    company_id = request.args.get('company_id')
    
    # Debug log current session
    app.logger.debug(f"Session data: {dict(session)}")
    app.logger.debug(f"Current user: {current_user}")
    
    # Initialize company info
    company_name = ''
    company_email = ''
    
    # If company_id is provided in the URL
    if company_id:
        # Try to get company info by ID
        company_name = get_company_name_by_id(company_id)
        company_email = get_company_email_by_id(company_id)
        
        # Update session with the selected company
        session['selected_company'] = {
            'id': company_id,
            'name': company_name,
            'email': company_email
        }
        session['company_name'] = company_name
        session['company_email'] = company_email
        session['company_id'] = company_id
    else:
        # Fall back to session data if no company_id in URL
        selected_company = session.get('selected_company', {})
        company_name = selected_company.get('name') or session.get('company_name')
        company_email = selected_company.get('email') or session.get('company_email')
        company_id = selected_company.get('id') or session.get('company_id')
        
        # Fall back to user's company info if not found
        if not company_name and hasattr(current_user, 'company_name'):
            company_name = current_user.company_name
        if not company_email and hasattr(current_user, 'company_email'):
            company_email = current_user.company_email
        if not company_id and hasattr(current_user, 'company_id'):
            company_id = current_user.company_id
    
    # Update session with final values
    session['company_name'] = company_name
    session['company_email'] = company_email
    session['company_id'] = company_id
            
    # Log the company info being sent to template
    app.logger.info(f"Rendering blankets with company: {company_name}, email: {company_email}")
    
    # Create response and set company data in the session cookie
    response = make_response(render_template('products/blankets/blankets.html',
                         company_name=company_name,
                         company_email=company_email,
                         company_id=company_id,
                         current_company={
                             'id': company_id,
                             'name': company_name,
                             'email': company_email
                         }))
    
    # Set company info in cookies for client-side access
    response.set_cookie('company_name', company_name or '', httponly=True, samesite='Lax')
    response.set_cookie('company_email', company_email or '', httponly=True, samesite='Lax')
    response.set_cookie('company_id', str(company_id) if company_id else '', httponly=True, samesite='Lax')
    
    return response

# Reset password page
@app.route('/reset-password')
def reset_password_page():
    return render_template('reset_password.html')

# Helper functions to get company name and email by ID
def get_company_name_by_id(company_id):
    """Get company name by ID.
    Priority: MongoDB -> JSON fallback."""
    try:
        # Try MongoDB first
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            try:
                doc = mongo_db.companies.find_one({'_id': ObjectId(company_id)})
            except Exception:
                doc = mongo_db.companies.find_one({'_id': company_id})
            if doc:
                normalized = {k.lower().replace(' ', ''): v for k, v in doc.items()}
                for key in ['name', 'companyname', 'company_name']:
                    if key in normalized and normalized[key]:
                        return normalized[key]
        # Skip JSON fallback when MongoDB is enabled
        if not (MONGO_AVAILABLE and USE_MONGO and mongo_db is not None):
            # Fallback to JSON file lookup
            file_path = os.path.join(app.root_path, 'static', 'data', 'company_emails.json')
            with open(file_path, 'r') as f:
                companies = json.load(f)
                # Convert company_id to int if it's a string
                try:
                    idx = int(company_id) - 1
                    if 0 <= idx < len(companies):
                        return companies[idx].get('Company Name', '')
                except (ValueError, TypeError):
                    # If company_id is not a number, try to find by exact match in ID field
                    for company in companies:
                        if str(company.get('id', '')).lower() == str(company_id).lower():
                            return company.get('Company Name', '')

    except Exception as e:
        app.logger.error(f"Error getting company name: {e}")
    return ''

def get_company_email_by_id(company_id):
    """Get company email by ID.
    Priority: MongoDB -> JSON fallback."""
    try:
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            try:
                doc = mongo_db.companies.find_one({'_id': ObjectId(company_id)})
            except Exception:
                doc = mongo_db.companies.find_one({'_id': company_id})
            if doc:
                normalized = {k.lower().replace(' ', ''): v for k, v in doc.items()}
                for key in ['email', 'emailid', 'email_id', 'emailid']:
                    if key in normalized and normalized[key]:
                        return normalized[key]
        # Skip JSON fallback when MongoDB is enabled
        if not (MONGO_AVAILABLE and USE_MONGO and mongo_db is not None):
            file_path = os.path.join(app.root_path, 'static', 'data', 'company_emails.json')
            with open(file_path, 'r') as f:
                companies = json.load(f)
                # Convert company_id to int if it's a string
                try:
                    idx = int(company_id) - 1
                    if 0 <= idx < len(companies):
                        return companies[idx].get('EmailID', '')
                except (ValueError, TypeError):
                    # If company_id is not a number, try to find by exact match in ID field
                    for company in companies:
                        if str(company.get('id', '')).lower() == str(company_id).lower():
                            return company.get('EmailID', '')
    except Exception as e:
        app.logger.error(f"Error getting company email: {e}")
        return ''

# Error handling
@app.errorhandler(404)
def page_not_found(e):
    return render_template('404.html'), 404

# Start app
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    if os.environ.get('FLASK_ENV') == 'production':
        serve(app, host="0.0.0.0", port=port)
    else:
        app.run(host='0.0.0.0', port=port, debug=True)

# Initialize users dictionary after all function definitions
if USE_MONGO:
    users = {}
else:
    users = load_users()
    print(f"Loaded {len(users)} users from file")
