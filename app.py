from flask import Flask, render_template, send_from_directory, request, redirect, url_for, jsonify, flash, session, make_response, send_file
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
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
import jwt
import random
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

# Import MongoDB users module
try:
    from mongo_users import (
        find_user_by_id as mu_find_user_by_id,
        find_user_by_email_or_username as mu_find_user_by_email_or_username,
        create_user as mu_create_user,
        verify_password as mu_verify_password,
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

# JWT Configuration

# -------------------- MongoDB configuration --------------------
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
    def __init__(self, id, email, username, password_hash, is_verified=False, otp_verified=False, cart=None, reset_token=None, reset_token_expiry=None):
        self.id = id
        self.email = email
        self.username = username
        self.password_hash = password_hash
        self.is_verified = is_verified
        self.otp_verified = otp_verified
        self.cart = cart if cart is not None else []
        self.reset_token = reset_token
        self.reset_token_expiry = reset_token_expiry

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'username': self.username,
            'password_hash': self.password_hash,
            'is_verified': self.is_verified,
            'reset_token': self.reset_token,
            'reset_token_expiry': self.reset_token_expiry.isoformat() if self.reset_token_expiry else None,
            'otp_verified': self.otp_verified
        }

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def generate_auth_token(self, expires_in=JWT_EXPIRATION):
        return jwt.encode(
            {'user_id': self.id, 'exp': time() + expires_in},
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
                    reset_token=user_data.get('reset_token'),
                    reset_token_expiry=datetime.fromisoformat(user_data.get('reset_token_expiry')) if user_data.get('reset_token_expiry') else None,
                    otp_verified=user_data.get('otp_verified', False)
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
        except Exception as e:
            print(f"Error creating users file: {e}")
        return {}

# Public aliases expected by legacy code -------------------------------------

def load_users():
    """Legacy wrapper around _load_users_json."""
    return _load_users_json()

def save_users(users_dict=None):
    """Legacy wrapper around _save_users_json."""
    return _save_users_json(users_dict)

# Load users at startup for JSON fallback
users = load_users()

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
                    otp_verified=doc.get('otp_verified', False),
                    reset_token=doc.get('reset_token'),
                    reset_token_expiry=doc.get('reset_token_expiry')
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
else:
    # Fallback to JSON versions defined above
    load_users = _load_users_json
    save_users = _save_users_json

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

# Ensure app is only initialized once
if not hasattr(sys, 'app_initialized'):
    sys.app_initialized = True
    app = Flask(__name__, static_url_path='/static', static_folder='static', template_folder='templates')
    app.secret_key = os.getenv('SECRET_KEY', 'dev-key-123')
    app.logger.info("Flask app initialized")
    app.logger.info("Registering routes...")
else:
    app.logger.warning("App already initialized - skipping initialization")

# Get the existing app instance
app = Flask(__name__, static_url_path='/static', static_folder='static', template_folder='templates')
app.secret_key = os.getenv('SECRET_KEY', 'dev-key-123')

# Add regex_search filter to Jinja2 environment
@app.template_filter('regex_search')
def regex_search_filter(s, pattern):
    """Check if the pattern matches the string."""
    if not s or not pattern:
        return False
    return bool(re.search(pattern, str(s)))

app.logger.info("Flask app initialized")
app.logger.info("Registering routes...")

# Initialize cart store
# -------------------- Cart storage abstractions --------------------
class MongoCartStore:
    """MongoDB-backed cart store with one cart document per user."""

    def __init__(self, db):
        self.col = db.get_collection('carts')

    def _doc(self, user_id):
        return self.col.find_one({"user_id": user_id}) or {}

    def get_cart(self, user_id):
        doc = self._doc(user_id)
        return doc.get('products', [])

    def save_cart(self, user_id, products):
        self.col.update_one(
            {"user_id": user_id},
            {"$set": {"products": products, "updated_at": datetime.utcnow()}},
            upsert=True
        )
        return True

    def clear_cart(self, user_id):
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
        if not hasattr(current_user, 'id'):
            return {"products": []}
            
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            products = cart_store.get_cart(current_user.id)
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
                        gst_percent = float(product.get('gst_percent', 18))
                        
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
        print("MongoDB is not available for cart storage")
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
    users = load_users()
    print(f"Loaded {len(users)} users from file")

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
                otp_verified=doc.get('otp_verified', False)
            )
            print(f'Successfully loaded user: {user.email} (ID: {user.id})')
            return user
        except Exception as e:
            print(f"Error loading user {user_id}: {e}")
            return None
    else:
        print('MongoDB not available, falling back to JSON users')
        return users.get(user_id) if hasattr(users, 'get') else None

@app.route('/')
def home():
    if current_user.is_authenticated:
        return redirect(url_for('display'))
    return redirect(url_for('login'))

@app.route('/cart')
@login_required
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
        
        # Get company info from session
        selected_company = session.get('selected_company', {})
        
        # Fallback to direct session values if not in selected_company
        company_name = selected_company.get('name') or session.get('company_name', '')
        company_email = selected_company.get('email') or session.get('company_email', '')
        
        # Ensure values are stored in both places for consistency
        if company_name and company_email:
            session['selected_company'] = {
                'name': company_name,
                'email': company_email
            }
            session['company_name'] = company_name
            session['company_email'] = company_email
        
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
        print(f"Error in cart route: {e}")
        import traceback
        traceback.print_exc()
        # Return empty cart on error
        return render_template('cart.html', cart={"products": [], "error": str(e)})

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
        return jsonify({'success': False, 'error': str(e)})

@app.route('/add_to_cart', methods=['POST'])
@login_required
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
                
            # Add product to cart
            cart['products'].append(product)
            
            # Save updated cart
            save_user_cart(cart)
            
            # Get updated cart count
            updated_cart = get_user_cart()
            cart_count = len(updated_cart.get('products', [])) if updated_cart and isinstance(updated_cart, dict) else 0
            
            return jsonify({
                'success': True,
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
        

@app.route('/get_cart_count')
@login_required
def get_cart_count():
    """Return the number of products currently in the user's cart."""
    try:
        cart = get_user_cart()
        return jsonify({'count': len(cart.get('products', []))})
    except Exception as e:
        print(f"Error in get_cart_count: {e}")
        return jsonify({'count': 0}), 500

@app.route('/display')
@login_required
def display():
    return render_template('display.html')

@app.route('/login')
def login():
    if current_user.is_authenticated:
        # If user is already logged in, redirect to display page
        return redirect(url_for('display'))
    return render_template('login.html')

# Add a route to handle root URL
@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('display'))
    return redirect(url_for('login'))

@app.route('/signup')
def signup():
    return render_template('signup.html')

@app.route('/company_selection', methods=['GET', 'POST'])
@login_required
def company_selection():
    # If user is not authenticated, redirect to login
    if not current_user.is_authenticated:
        return redirect(url_for('login'))
    
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

@app.route('/blankets')
@login_required
def blankets():
    # Check if company and product type are selected
    selected_company = session.get('selected_company')
    product_type = session.get('product_type')
    
    if not selected_company or product_type != 'blanket':
        return redirect(url_for('product_selection'))
    
    return render_template('products/blankets/blankets.html')



@app.route('/select_company', methods=['POST'])
@login_required
def select_company():
    company_id = request.form.get('company')
    if not company_id:
        flash('Please select a company', 'danger')
        return redirect(url_for('company_selection'))
    
    # Get company details from the form
    company_name = request.form.get('company_name', '')
    company_email = request.form.get('company_email', '')
    
    # Save company in session with all details
    session['selected_company'] = {
        'id': company_id,
        'name': company_name,
        'email': company_email
    }
    
    # Also save directly in session for backward compatibility
    session['company_name'] = company_name
    session['company_email'] = company_email
    
    return redirect(url_for('product_selection'))

@app.route('/get_companies')
def get_companies():
    try:
        # Load companies from static JSON file
        with open('static/data/company_emails.json', 'r') as f:
            companies = json.load(f)
            # Transform data to match expected format
            formatted_companies = [{
                'id': str(i + 1),
                'name': company['Company Name'],
                'email': company['EmailID']
            } for i, company in enumerate(companies)]
            return jsonify(formatted_companies)
    except Exception as e:
        print(f"Error loading companies: {e}")
        return jsonify([]), 500

@app.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        email = request.form.get('email')
        if not email:
            flash('Email is required', 'danger')
            return redirect(url_for('forgot_password'))
        # Ensure latest users loaded
        global users
        users = load_users()
                # Find user by email
        if USE_MONGO:
            doc = mu.find_user_by_email_or_username(email)
            if not doc:
                flash('No account with that email', 'danger')
                return redirect(url_for('forgot_password'))
            user_obj = User(
                id=doc['_id'],
                email=doc['email'],
                username=doc['username'],
                password_hash=doc['password_hash'],
                is_verified=doc.get('is_verified', False),
                otp_verified=doc.get('otp_verified', False)
            )
        else:
            user_obj = None
            for u in users.values():
                if u.email == email:
                    user_obj = u
                    break
        if not user_obj:
            flash('No account with that email', 'danger')
            return redirect(url_for('forgot_password'))
        # Generate OTP
        otp = str(random.randint(100000, 999999))
        if USE_MONGO:
            # persist OTP in Mongo
            mu.update_user(user_obj.id, {
                "reset_token": otp,
                "reset_token_expiry": datetime.now() + timedelta(minutes=10)
            })
        else:
            user_obj.reset_token = otp
            user_obj.reset_token_expiry = datetime.now() + timedelta(minutes=10)
            save_users()
        # Email OTP (if SMTP configured)
        if email_config_valid:
            try:
                msg = MIMEMultipart()
                msg['From'] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
                msg['To'] = email
                msg['Subject'] = "Password Reset OTP"
                body = f"Your password reset OTP is: {otp}\nThis code will expire in 10 minutes."
                msg.attach(MIMEText(body, 'plain'))
                with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                    if SMTP_USERNAME and SMTP_PASSWORD:
                        server.login(SMTP_USERNAME, SMTP_PASSWORD)
                    server.sendmail(EMAIL_FROM, email, msg.as_string())
            except Exception as e:
                print(f"SMTP send error: {e}")
        flash('OTP sent to your email address', 'success')
        return redirect(url_for('reset_password'))
    return render_template('forgot_password.html')

# API Routes

# ---------------------------------------------------------------------------
# Quotation Preview Page
# ---------------------------------------------------------------------------
@app.route('/quotation_preview')
@login_required
def quotation_preview():
    # Get current date and time
    current_datetime = datetime.now()
    quote_date = current_datetime.strftime('%d-%m-%Y')
    quote_time = current_datetime.strftime('%H:%M:%S')
    
    cart = get_user_cart()
    if not cart.get('products'):
        flash('Your cart is empty', 'warning')
        return redirect(url_for('cart'))

    # Get company info from selected_company dict first, then fallback to direct session values
    selected_company = session.get('selected_company', {})
    customer_name = selected_company.get('name', session.get('company_name', ''))
    customer_email = selected_company.get('email', session.get('company_email', ''))
    
    # Ensure values are stored in both places for consistency
    if customer_name and customer_email:
        session['selected_company'] = {
            'name': customer_name,
            'email': customer_email
        }
        session['company_name'] = customer_name
        session['company_email'] = customer_email

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
            
            # Calculate price after discount
            price_after_discount = subtotal - discount_amount
            
            # Calculate GST on discounted amount
            gst_amount = (price_after_discount * gst_percent / 100) if gst_percent else 0
            
            # Calculate final total including GST
            final_total = price_after_discount + gst_amount
            
            # Store calculations in the item
            item['calculations'] = {
                'base_price': round(base_price, 2),
                'bar_price': round(bar_price, 2),
                'unit_price': round(unit_price, 2),
                'quantity': quantity,
                'subtotal': round(subtotal, 2),
                'discount_percent': discount_percent,
                'discount_amount': round(discount_amount, 2),
                'discounted_subtotal': round(price_after_discount, 2),
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
            gst_percent = float(item.get('gst_percent', 0))
            
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
    
    # Calculate final totals by summing up all item final_totals
    final_subtotal = 0
    for item in cart.get('products', []):
        final_subtotal += item.get('calculations', {}).get('final_total', 0)
    
    # Round to 2 decimal places for display
    final_subtotal = round(final_subtotal, 2)
    total = final_subtotal  # In this case, subtotal and total are the same

    context = {
        'cart': cart,
        'quote_date': quote_date,
        'quote_time': quote_time,
        'company_name': customer_name,
        'company_email': customer_email,
        'calculations': {
            'subtotal': final_subtotal,
            'total': total
        }
    }
    
    return render_template('quotation.html', **context)

# ---------------------------------------------------------------------------
# Send Quotation Route
# ---------------------------------------------------------------------------
@app.route('/send_quotation', methods=['POST'])
@login_required
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

        # Determine recipient emails
        selected_company = session.get('selected_company')
        if not isinstance(selected_company, dict):
            selected_company = {}
        customer_email = selected_company.get('email') or current_user.email
        if not customer_email:
            return jsonify({'error': 'Customer email not available'}), 400

        # Send to customer and MD's desk
        recipients = [customer_email, 'md.desk@chemo.in']

        # Get current date
        today = datetime.utcnow().strftime('%d/%m/%Y')

        # Table rows
        rows_html = """
        <table style='width: 100%; border-collapse: collapse; margin: 20px 0;'>
            <thead>
                <tr style='background-color: #f5f5f5; text-align: left;'>
                    <th style='padding: 8px; border: 1px solid #ddd;'>Item</th>
                    <th style='padding: 8px; border: 1px solid #ddd;'>Quantity</th>
                    <th style='padding: 8px; border: 1px solid #ddd;'>Unit Price</th>
                    <th style='padding: 8px; border: 1px solid #ddd;'>Total Price</th>
                </tr>
            </thead>
            <tbody>
        """

        for idx, p in enumerate(products, start=1):
            machine = p.get('machine', '')
            prod_type = p.get('type', '')
            
            # Dimensions (for blanket)
            length = p.get('length', 0)
            width = p.get('width', 0)
            unit = p.get('unit', '')
            
            # Thickness
            thickness = p.get('thickness', '')
            
            # Pricing
            quantity = p.get('quantity', 1)
            unit_price = p.get('unit_price', 0)
            
            # Use different total price calculation based on product type
            if prod_type == 'mpack':
                calcs = p.get('calculations', {})
                total_price = calcs.get('final_total', 0)
            else:
                total_price = p.get('total_price', 0)
            
            # For mpack, show size instead of dimensions
            size = p.get('size', '')
            dimensions_str = f"Dimensions: {size}" if size else f"Dimensions: {length} x {width} {unit}"
            
            rows_html += f"""
                <tr style='border-bottom: 1px solid #ddd;'>
                    <td style='padding: 8px; border: 1px solid #ddd;'>
                        {idx}. {p.get('name', '')}<br>
                        Machine: {machine}<br>
                        Type: {prod_type}<br>
                        {dimensions_str}<br>
                        {'Thickness: ' + str(thickness) if thickness else ''}<br>
                        Bar Type: {p.get('bar_type', '')}<br>
                        GST: {18.0 if p.get('type') == 'blanket' else 12.0}%
                    </td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{quantity}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>₹{unit_price:,.2f}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>₹{total_price:,.2f}</td>
                </tr>
            """

        rows_html += """
            </tbody>
        </table>
        """

        # Build full HTML
        quotation_html = f"""
        <div style='font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: auto; line-height: 1.6;'>
          <h2 style='text-align: left; margin-bottom: 20px;'>QUOTATION</h2>
          
          <div style='margin-bottom: 20px;'>
            <h4>Company Information</h4>
            <p>Company: {selected_company.get('name', 'N/A')}</p>
            <p>Email: {customer_email}</p>
          </div>

          <div style='margin-bottom: 20px;'>
            <h4>Quotation Details</h4>
            <p>Date: {today}</p>
            <p>Notes: {notes or 'No additional notes'}</p>
          </div>

          {rows_html}

          <div style='margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px;'>
            <h4 style='margin: 0 0 10px 0;'>Total Amount</h4>
            <p style='margin: 0;'>₹{sum(
                p.get('calculations', {}).get('final_total', 0) if p.get('type') == 'mpack' 
                else p.get('total_price', 0)
                for p in products
            ):,.2f}</p>
          </div>

          <div style='margin-top: 30px; text-align: right;'>
            <p>Best regards,</p>
            <p>Chemo India Pvt. Ltd.</p>
          </div>
        </div>
        """

        # Create message
        msg = MIMEMultipart()
        msg['From'] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
        msg['To'] = ', '.join(recipients)
        msg['Subject'] = f"Quotation from Chemo India - {today}"
        
        # Attach HTML version
        part = MIMEText(quotation_html, 'html')
        msg.attach(part)

        # Send the email
        if SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT)
        else:
            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
            server.starttls()
        
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()

        return jsonify({
            'success': True,
            'message': 'Quotation sent successfully'
        })
    except Exception as e:
        app.logger.error(f"Error sending quotation: {str(e)}")
        return jsonify({
            'error': 'Failed to send quotation',
            'details': str(e)
        }), 500

        # Send to customer and MD's desk
        recipients = [customer_email, 'md.desk@chemo.in']

        # Get current date
        today = datetime.utcnow().strftime('%d/%m/%Y')

        # Table rows
        rows_html = """
        <table style='width: 100%; border-collapse: collapse; margin: 20px 0; font-family: Arial, sans-serif;'>
            <thead>
                <tr>
                    <th style='padding: 8px; text-align: left; border: 1px solid #ddd;'>#</th>
                    <th style='padding: 8px; text-align: left; border: 1px solid #ddd;'>Machine</th>
                    <th style='padding: 8px; text-align: left; border: 1px solid #ddd;'>Product</th>
                    <th style='padding: 8px; text-align: left; border: 1px solid #ddd;'>Type</th>
                    <th style='padding: 8px; text-align: left; border: 1px solid #ddd;'>Thickness</th>
                    <th style='padding: 8px; text-align: left; border: 1px solid #ddd;'>Size</th>
                    <th style='padding: 8px; text-align: left; border: 1px solid #ddd;'>Barring</th>
                    <th style='padding: 8px; text-align: right; border: 1px solid #ddd;'>Qty</th>
                    <th style='padding: 8px; text-align: right; border: 1px solid #ddd;'>Disc %</th>
                    <th style='padding: 8px; text-align: right; border: 1px solid #ddd;'>Amount (₹)</th>
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
                # For mpack, use calculations from the cart if available
                calcs = p.get('calculations', {})
                if calcs:
                    total_val = calcs.get('final_total', 0)
                else:
                    # Fallback calculation
                    unit_price = p.get('unit_price', 0)
                    discount_percent = p.get('discount_percent', 0)
                    gst_percent = p.get('gst_percent', 12)  # 12% GST for mpack
                    
                    subtotal_val = unit_price * qty
                    discount_amount = (subtotal_val * discount_percent / 100) if discount_percent else 0
                    taxable_amount = subtotal_val - discount_amount
                    gst_amount = (taxable_amount * gst_percent / 100)
                    total_val = taxable_amount + gst_amount
                
            elif prod_type == 'blanket':
                # For blanket, use calculations from the cart
                calcs = p.get('calculations', {})
                if calcs:
                    total_val = calcs.get('final_total', 0)
                else:
                    unit_price = p.get('unit_price', 0)
                    discount_percent = p.get('discount_percent', 0)
                    gst_percent = p.get('gst_percent', 18)
                    
                    subtotal_val = unit_price * qty
                    discount_amount = (subtotal_val * discount_percent / 100) if discount_percent else 0
                    taxable_amount = subtotal_val - discount_amount
                    gst_amount = (taxable_amount * gst_percent / 100)
                    total_val = taxable_amount + gst_amount
            
            subtotal += total_val
            
            rows_html += f"""
                <tr>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{idx}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{machine}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{prod_type}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{p.get('blanket_type', '----') if prod_type == 'blanket' else '----'}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{p.get('thickness', '----')}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{dimensions}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{p.get('bar_type', '----') if prod_type == 'blanket' else '----'}</td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd;'>{qty}</td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd;'>{p.get('discount_percent', 0)}%</td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd;'>₹{total_val:,.2f}</td>
                </tr>
            """
        
        # Add total row
        rows_html += f"""
            </tbody>
            <tfoot>
                <tr>
                    <td colspan='8' style='border: none;'></td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold;'>Subtotal:</td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold;'>₹{subtotal:,.2f}</td>
                </tr>
                <tr>
                    <td colspan='8' style='border: none;'></td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold;'>Total:</td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold;'>₹{subtotal:,.2f}</td>
                </tr>
                <tr>
                    <td colspan='9' style='padding: 8px; text-align: right; border: 1px solid #ddd;'><strong>Subtotal:</strong></td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd;'><strong>₹{subtotal:,.2f}</strong></td>
                </tr>
                <tr>
                    <td colspan='9' style='padding: 8px; text-align: right; border: 1px solid #ddd;'><strong>Total:</strong></td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd;'><strong>₹{subtotal:,.2f}</strong></td>
                </tr>
            </tfoot>
        </table>
        <p>For more information, please contact: <a href='mailto:info@chemo.in'>info@chemo.in</a></p>
        <p>This quotation is not a contract or invoice. It is our best estimate.</p>
        """

        # Build full HTML
        quotation_html = """
        <div style='font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: auto; line-height: 1.6;'>
          <h2 style='text-align: left; margin-bottom: 20px;'>QUOTATION</h2>
          
          <div style='margin-bottom: 20px;'>
            <h4>Company Information</h4>
            <p style='margin: 5px 0;'><strong>Company Name:</strong> Chemo Graphic International<br>
            <strong>Address:</strong> 113, 114 High Tech Industrial Centre, Caves Rd, Jogeshwari East, Mumbai, Maharashtra 400060<br>
            <strong>Email:</strong> operations@chemo.in</p>
          </div>
          
          <div style='margin: 20px 0;'>
            <h4>Customer Information</h4>
            <p style='margin: 5px 0;'>
              {selected_company.get('name', '')}<br>
              {customer_email}
            </p>
          </div>
          
          <div style='margin: 20px 0;'>
            <p>Hello,</p>
            <p>This is test from CGI.</p>
            <p>Here is the proposed quotation for the required products:</p>
          </div>
          <table style='width: 100%; margin-bottom: 20px;'>
            <tr>
              <td>
                <strong>CGI - Chemo Graphics India</strong><br>
                123 Print Lane, Mumbai, India<br>
                Email: info@chemo.in
              </td>
              <td style='text-align: right;'>
                <strong>Quote #:</strong> {quote_id}<br>
                <strong>Date:</strong> {today}
              </td>
            </tr>
          </table>
          <div style='margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-radius: 5px;'>
            <p><strong>To:</strong> {selected_company.get('name', '')}</p>
            <p><strong>Email:</strong> {customer_email}</p>
          </div>
          <p>Hello,<br><br>This is <strong>{current_user.username}</strong> from CGI.<br>Here is the proposed quotation for the required products:</p>
          {f'<p><strong>Notes:</strong><br>{notes}</p>' if notes else ''}
          <table style='width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;'>
            <thead>
              <tr style='background-color: #2c3e50; color: white;'>
                <th style='padding: 10px; text-align: left;'>#</th>
                <th style='padding: 10px; text-align: left;'>Machine</th>
                <th style='padding: 10px; text-align: left;'>Product</th>
                <th style='padding: 10px; text-align: left;'>Type</th>
                <th style='padding: 10px; text-align: left;'>Size</th>
                <th style='padding: 10px; text-align: left;'>Barring</th>
                <th style='padding: 10px; text-align: right;'>Qty</th>
                <th style='padding: 10px; text-align: right;'>Disc %</th>
                <th style='padding: 10px; text-align: right;'>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows_html}
            </tbody>
            <tfoot>
              <tr>
                <td colspan='8' style='text-align: right; padding: 10px; border-top: 2px solid #ddd;'><strong>Subtotal:</strong></td>
                <td style='text-align: right; padding: 10px; border-top: 2px solid #ddd;'><strong>₹{subtotal:,.2f}</strong></td>
              </tr>
              <tr>
                <td colspan='8' style='text-align: right; padding: 10px;'><strong>Total:</strong></td>
                <td style='text-align: right; padding: 10px; font-size: 1.1em;'><strong>₹{subtotal:,.2f}</strong></td>
              </tr>
            </tfoot>
          </table>
          <p style='margin-top: 20px;'>Thank you for your business!<br>— Team CGI</p>
          <hr>
          <small>
            This quotation is not a contract or invoice. It is our best estimate.
          </small>
        </div>
        """

        # Total is same as subtotal since amounts already include any taxes
        total = subtotal
        
        # Build email content using the same rows_html
        email_content = f"""
        <div style='font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: auto; line-height: 1.6;'>
          <h2 style='text-align: left; margin-bottom: 20px;'>QUOTATION</h2>
          
          <div style='margin-bottom: 20px;'>
            <h4>Company Information</h4>
            <p style='margin: 5px 0;'>
              <strong>CGI - Chemo Graphics India</strong><br>
              123 Print Lane, Mumbai, India<br>
              Email: info@chemo.in<br>
              Date: {today}
            </p>
          </div>
          
          <div style='margin: 20px 0;'>
            <h4>Customer Information</h4>
            <p style='margin: 5px 0;'>
              {selected_company.get('name', '')}<br>
              {customer_email}
            </p>
          </div>
          
          <div style='margin: 20px 0;'>
            <p>Hello,</p>
            <p>This is {current_user.username} from CGI.</p>
            <p>Here is the proposed quotation for the required products:</p>
            {f'<p><strong>Notes:</strong><br>{notes}</p>' if notes else ''}
          </div>
          
          {rows_html}
          
          <p style='margin-top: 20px;'>Thank you for your business!<br>— Team CGI</p>
          <hr>
          <small>
            This quotation is not a contract or invoice. It is our best estimate.
          </small>
        </div>
        """

        # Email sending
        if not refresh_email_config():  # Refresh config before sending
            return jsonify({'error': 'Email configuration invalid'}), 500

        subject = f"CGI Quotation - {today}"
        try:
            # Create message container
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
            msg['To'] = ', '.join(recipients)
            
            # Attach HTML content
            msg.attach(MIMEText(email_content, 'html'))
            
            # Send email
            try:
                with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                    if SMTP_PORT == 587:  # TLS
                        server.starttls()
                    server.login(SMTP_USERNAME, SMTP_PASSWORD)
                    server.sendmail(EMAIL_FROM, recipients, msg.as_string())
                    
                # Clear cart after successful email
                clear_cart()
                session.pop('selected_company', None)
                
                return jsonify({
                    'success': True,
                    'message': 'Quotation sent successfully',
                    'quote_id': quote_id
                })
                
            except Exception as e:
                app.logger.error(f"Failed to send email: {str(e)}")
                return jsonify({
                    'error': f'Failed to send email: {str(e)}',
                    'details': str(e)
                }), 500
            
        except Exception as e:
            app.logger.error(f"Email construction failed: {str(e)}")
            return jsonify({
                'error': f'Failed to construct email: {str(e)}',
                'details': str(e)
            }), 500
            html = """
            <div style='font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: auto; line-height: 1.6;'>
              <h2 style='text-align: left; margin-bottom: 20px;'>QUOTATION</h2>
            </div>
            """
            
            # Attach HTML version
            part = MIMEText(html, 'html')
            msg.attach(part)

            # Send the email
            if SMTP_PORT == 465:
                server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT)
            else:
                server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
                
            # Set debug level to see SMTP communication
            server.set_debuglevel(1)
            
            # Start TLS if needed (for ports 587 and 25)
            if SMTP_PORT in [587, 25]:
                server.starttls()
                
            # Login only if credentials are provided
            if SMTP_USERNAME and SMTP_PASSWORD:
                try:
                    server.login(SMTP_USERNAME, SMTP_PASSWORD)
                except smtplib.SMTPNotSupportedError as e:
                    print(f"SMTP AUTH not supported by server: {e}")
                    # Continue without authentication if not supported
            
            # Send the email
            server.send_message(msg)
            server.quit()
            
            # Clear the cart after successful email send
            try:
                if current_user.is_authenticated:
                    if USE_MONGO and mongo_db:
                        mongo_db.carts.delete_one({'user_id': str(current_user.id)})
                    else:
                        # Fallback to session-based cart
                        if 'cart' in session:
                            session.pop('cart')
                return jsonify({'success': True, 'message': 'Quotation sent successfully'})
            except Exception as clear_error:
                app.logger.error(f"Error clearing cart after sending quotation: {clear_error}")
                return jsonify({
                    'success': True, 
                    'message': 'Quotation sent but there was an error clearing the cart. Please clear it manually.'
                })
            
        except smtplib.SMTPException as e:
            print(f"SMTP Error: {e}")
            return jsonify({'error': f'Failed to send email: {str(e)}'}), 500
            
        except Exception as e:
            print(f"Unexpected error sending email: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': 'Internal server error'}), 500
            
    except Exception as e:
        print(f"Error in send_quotation: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'An unexpected error occurred while processing your request'}), 500

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
            'redirectTo': '/display',  # Changed from '/login' to '/display'
            'user': {
                'id': new_user.id,
                'email': new_user.email,
                'username': new_user.username
            }
        })
        
    except Exception as e:
        print(f"Registration error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    try:
        data = request.get_json()
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
                    return jsonify({'error': 'Invalid email/username or password'}), 401
                    
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
                    return jsonify({'error': 'Invalid email/username or password'}), 401
                
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
                
                return jsonify({
                    'success': True,
                    'message': 'Login successful',
                    'redirectTo': '/display',  # Changed from '/company_selection' to '/display'
                    'user': {
                        'id': str(user.id),  # Ensure ID is string for JSON serialization
                        'email': user.email,
                        'username': user.username
                    }
                })
                
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
            'redirectTo': '/company_selection',
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
            return jsonify({
                'success': True,
                'user': {
                    'id': current_user.id,
                    'email': current_user.email,
                    'username': current_user.username
                }
            })
        else:
            return jsonify({'error': 'Not logged in'}), 401
    except Exception as e:
        print(f"User error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/request-password-reset', methods=['POST'])
def api_request_password_reset():
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
            
        print(f"Password reset requested for email: {email}")
            
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
            
        # Generate OTP
        otp = str(random.randint(100000, 999999))
        reset_data = {
            'reset_token': otp,
            'reset_token_expiry': datetime.utcnow() + timedelta(minutes=10)
        }
        
        if MONGO_AVAILABLE and USE_MONGO:
            print(f"Updating reset token for user {user['_id']}")
            users_col.update_one(
                {'_id': user['_id']},
                {'$set': reset_data}
            )
        else:
            # Fallback to JSON storage
            user.reset_token = otp
            user.reset_token_expiry = datetime.utcnow() + timedelta(minutes=10)
            save_users()
        
        # Send OTP to email (similar to signup flow)
        if email_config_valid:
            try:
                msg = MIMEMultipart()
                msg['From'] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
                msg['To'] = email
                msg['Subject'] = "Password Reset OTP"
                
                body = f"Your password reset OTP is: {otp}\nThis code will expire in 10 minutes."
                msg.attach(MIMEText(body, 'plain'))
                
                with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                    server.starttls()
                    server.login(SMTP_USERNAME, SMTP_PASSWORD)
                    server.send_message(msg)
                    print(f"Password reset email sent to {email}")
            except Exception as e:
                print(f"Error sending email: {str(e)}")
                import traceback
                traceback.print_exc()
                return jsonify({'error': 'Failed to send OTP. Please try again later.'}), 500
        else:
            print("Email configuration is invalid, cannot send OTP")
                
        return jsonify({
            'success': True,
            'message': 'OTP has been sent to your email',
            'email': email  # Return the email for client-side reference
        })
        
    except Exception as e:
        print(f"Password reset error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/verify-reset-otp', methods=['POST'])
def api_verify_reset_otp():
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        otp = data.get('otp', '').strip()
        
        if not all([email, otp]):
            return jsonify({'error': 'Email and OTP are required'}), 400
            
        print(f"Verifying OTP for email: {email}")
            
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
            
        # If we get here, OTP is valid
        print("OTP verified successfully")
        return jsonify({
            'success': True,
            'message': 'OTP verified successfully',
            'email': email,  # Return the email for client-side reference
            'otp': otp      # Return the OTP for client-side reference
        })
        
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
        new_password = data.get('newPassword', '').strip()
        
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
            'redirectTo': '/login'
        })
        
    except Exception as e:
        print(f"Password reset error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

# ... (rest of the code remains the same)

@app.route('/chemicals/<filename>')
def chemicals(filename):
    try:
        return send_from_directory('static/chemicals', filename)
    except Exception as e:
        app.logger.error(f"Error serving chemicals file: {str(e)}")
        return jsonify({'error': f'Failed to serve file: {str(e)}'}), 500

@app.route('/blankets_data/<filename>')
def blankets_data(filename):
    return send_from_directory('static/data/blankets', filename)

@app.route('/chemicals_data/<filename>')
def chemicals_data(filename):
    return send_from_directory('static/data/chemicals', filename)

@app.route('/static/data/blankets/<filename>')
def static_blankets(filename):
    return send_from_directory('static/data/blankets', filename)

@app.route('/static/data/chemicals/<filename>')
def static_chemicals(filename):
    return send_from_directory('static/data/chemicals', filename)

# Product pages
@app.route('/mpacks')
@login_required
def mpacks():
    app.logger.info("\n=== ACCESSING MPACKS ROUTE ===")
    
    # Debug: Log all session variables
    app.logger.info(f"Session data: {dict(session)}")
    
    # Check if company and product type are selected
    company = session.get('selected_company')
    product_type = session.get('product_type')
    
    app.logger.info(f"Company: {company}")
    app.logger.info(f"Product type: {product_type}")
    
    if not company or product_type != 'mpack':
        app.logger.warning("\n!!! REDIRECTING TO PRODUCT SELECTION !!!")
        app.logger.warning(f"Reason: company={company}, product_type={product_type}")
        return redirect(url_for('product_selection'))
    
    template_path = 'products/chemicals/mpack.html'
    app.logger.info(f"\n--- RENDERING TEMPLATE ---")
    app.logger.info(f"Template path: {template_path}")
    
    # Verify template exists
    import os
    template_full_path = os.path.join('templates', template_path)
    template_exists = os.path.exists(template_full_path)
    
    app.logger.info(f"Template exists: {template_exists}")
    app.logger.info(f"Absolute path: {os.path.abspath(template_full_path)}")
    
    if not template_exists:
        app.logger.error("ERROR: Template not found!")
        return "Template not found", 500
    
    app.logger.info("Attempting to render template...")
    response = render_template(template_path)
    app.logger.info("Template rendered successfully")
    
    return response


@app.route('/reset-password')
def reset_password_page():
    return render_template('reset_password.html')


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