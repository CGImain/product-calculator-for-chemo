// DOM Elements
const loginForm = document.querySelector('.card');
const loginBtn = document.getElementById('loginBtn');
const loginInput = document.getElementById('login');
const passwordInput = document.getElementById('password');
const errorDiv = document.getElementById('error');
const messageDiv = document.getElementById('message');
const togglePassword = document.querySelector('.toggle-password');

// Initialize the login form
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  
  // Check for success message in URL (after registration)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('registered') === 'true') {
    showMessage('Registration successful! Please sign in to continue.', 'success');
  }
  
  // Auto-focus the login input
  if (loginInput) {
    loginInput.focus();
  }
});

// Toggle password visibility
function togglePasswordVisibility() {
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    togglePassword.innerHTML = '<i class="fas fa-eye-slash"></i>';
  } else {
    passwordInput.type = 'password';
    togglePassword.innerHTML = '<i class="fas fa-eye"></i>';
  }
}

// Setup event listeners
function setupEventListeners() {
  // Login form submission
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  
  // Login button click
  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }
  
  // Toggle password visibility
  if (togglePassword) {
    togglePassword.addEventListener('click', togglePasswordVisibility);
  }
  
  // Handle Enter key in password field
  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleLogin(e);
      }
    });
  }
}

// Handle login form submission
async function handleLogin(e) {
  e.preventDefault();
  
  const login = loginInput.value.trim();
  const password = passwordInput.value.trim();
  
  // Clear previous errors
  clearMessages();
  
  // Validate inputs
  if (!login) {
    showError('Please enter your email or username');
    loginInput.focus();
    return;
  }
  
  if (!password) {
    showError('Please enter your password');
    passwordInput.focus();
    return;
  }
  
  try {
    // Show loading state
    setLoading(true);
    
    // Get CSRF token from form
    const csrfToken = document.querySelector('input[name="csrf_token"]');
    if (!csrfToken) {
      console.error('CSRF token not found in form');
      return;
    }
    const csrfHeader = { 'X-CSRFToken': csrfToken.value };
    
    // Send login request
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...csrfHeader
      },
      body: JSON.stringify({
        identifier: login,
        password
      })
    });

    try {
      const data = await response.json();
      
      if (!response.ok) {
        if (data.error) {
          showError(data.error);
          return;
        }
        showError('An error occurred. Please try again.');
        return;
      }
    } catch (e) {
      // If response is not JSON, show a generic error
      console.error('Response is not JSON:', e);
      showError('An error occurred. Please try again.');
      return;
    }
    
    if (response.ok && data.success) {
      // Store the token in localStorage
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
      }
      
      // Redirect to index page
      window.location.href = data.redirectTo || '/index';
    } else {
      // Show error message
      showError(data.error || 'Login failed. Please check your credentials.');
      
      // Clear password field on failed login
      passwordInput.value = '';
      passwordInput.focus();
    }
  } catch (error) {
    console.error('Login error:', error);
    showError('An error occurred. Please try again.');
  } finally {
    // Reset loading state
    setLoading(false);
  }
}

// Show error message
function showError(message) {
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Show success message
function showMessage(message, type = 'success') {
  if (messageDiv) {
    messageDiv.textContent = message;
    messageDiv.style.display = 'block';
    messageDiv.className = `message ${type}`;
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Auto-hide success message after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        messageDiv.style.display = 'none';
      }, 5000);
    }
  }
}

// Clear all messages
function clearMessages() {
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }
  
  if (messageDiv) {
    messageDiv.textContent = '';
    messageDiv.style.display = 'none';
    messageDiv.className = 'message';
  }
}

// Set loading state
function setLoading(isLoading) {
  if (!loginBtn) return;
  
  const btnText = loginBtn.querySelector('.btn-text');
  const btnLoader = loginBtn.querySelector('.btn-loader');
  
  if (isLoading) {
    loginBtn.disabled = true;
    if (btnText) btnText.style.visibility = 'hidden';
    if (btnLoader) btnLoader.style.display = 'flex';
  } else {
    loginBtn.disabled = false;
    if (btnText) btnText.style.visibility = 'visible';
    if (btnLoader) btnLoader.style.display = 'none';
  }
}
// Password toggle functionality added 