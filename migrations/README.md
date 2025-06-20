# Database Migrations

This directory contains database migration scripts for the application.

## Recent Changes (2025-06-17): Case-Insensitive Usernames

### Changes Made:
1. Usernames are now case-insensitive for login and registration
2. Emails are automatically converted to lowercase
3. Passwords remain case-sensitive
4. Added `username_lower` field for efficient case-insensitive searches

### Migration Steps:

1. Deploy the updated code
2. Run the migration script:
   ```bash
   python migrations/add_username_lower.py
   ```
3. Verify the migration was successful by checking the output

### Verification:

1. Test login with different username cases
2. Verify new user registrations work with mixed case
3. Check that email addresses are stored in lowercase
4. Ensure password case sensitivity is maintained
