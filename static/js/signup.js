// DOM Elements
const form = document.getElementById('signupForm');
const steps = document.querySelectorAll('.step');
const nextButtons = document.querySelectorAll('.next-btn');
const prevButtons = document.querySelectorAll('.prev-btn');
const requestOtpBtn = document.getElementById('requestOtpBtn');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const completeSignupBtn = document.getElementById('completeSignupBtn');
const emailInput = document.getElementById('email');
const otpInput = document.getElementById('otp');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const messageDiv = document.querySelector('.message');
if (!messageDiv) {
  messageDiv = document.createElement('div');
  messageDiv.className = 'message';
  document.querySelector('.step').appendChild(messageDiv);
}
const messageDivs = document.querySelectorAll('.message');
const resendOtpLink = document.getElementById('resendOtp');
const countdownElement = document.getElementById('countdown');
const emailDisplay = document.getElementById('emailDisplay');

// State
let currentStep = 0;
let otpRequested = false;
let otpSent = false;
let otpVerified = false;
let resendTimeout = 30; // 30 seconds cooldown for resend OTP
let countdownInterval;
let currentEmail = '';

// Initialize the form
function initForm() {
  console.log('Initializing form...');
  console.log('Request OTP button:', requestOtpBtn);
  
  showStep(0);
  setupEventListeners();
  
  // Check for URL parameters (for OTP verification)
  const urlParams = new URLSearchParams(window.location.search);
  const email = urlParams.get('email');
  
  if (email) {
    emailInput.value = email;
    // Auto-start OTP process if email is in URL
    handleRequestOtp({ preventDefault: () => {} });
  }
  
  // Force update button visibility after a short delay to ensure DOM is ready
  setTimeout(updateButtonVisibility, 100);
}

// Show specific step
function showStep(stepIndex) {
  // Hide all steps
  steps.forEach((step, index) => {
    step.classList.remove('active');
    if (index === stepIndex) {
      step.classList.add('active');
    }
  });
  
  currentStep = stepIndex;
  updateButtonVisibility();
  
  // Focus on the first input of the current step
  const currentStepElement = steps[stepIndex];
  const firstInput = currentStepElement.querySelector('input');
  if (firstInput) {
    firstInput.focus();
  }
}

// Update button visibility based on current step
function updateButtonVisibility() {
  // Hide all buttons first
  nextButtons.forEach(btn => btn.style.display = 'none');
  prevButtons.forEach(btn => btn.style.display = 'none');
  
  // Show appropriate buttons based on current step
  if (currentStep === 0) {
    // First step - show request OTP button
    if (requestOtpBtn) requestOtpBtn.style.display = 'block';
  } else if (currentStep === 1) {
    // Second step - show verify OTP button
    if (verifyOtpBtn) verifyOtpBtn.style.display = 'block';
    const prevBtn = steps[currentStep].querySelector('.prev-btn');
    if (prevBtn) prevBtn.style.display = 'block';
  } else if (currentStep === 2) {
    // Third step - show complete signup button
    if (completeSignupBtn) completeSignupBtn.style.display = 'block';
    const prevBtn = steps[currentStep].querySelector('.prev-btn');
    if (prevBtn) prevBtn.style.display = 'block';
  }
}

// Start OTP resend countdown
function startResendCountdown() {
  clearInterval(countdownInterval);
  resendOtpLink.classList.add('disabled');
  resendOtpLink.style.pointerEvents = 'none';
  
  let seconds = resendTimeout;
  updateCountdown(seconds);
  
  countdownInterval = setInterval(() => {
    seconds--;
    updateCountdown(seconds);
    
    if (seconds <= 0) {
      clearInterval(countdownInterval);
      resendOtpLink.classList.remove('disabled');
      resendOtpLink.style.pointerEvents = 'auto';
      countdownElement.textContent = '';
    }
  }, 1000);
}

// Update countdown display
function updateCountdown(seconds) {
  countdownElement.textContent = seconds;
}

// Handle resend OTP
async function handleResendOtp(e) {
  e.preventDefault();
  
  if (resendOtpLink.classList.contains('disabled')) {
    return;
  }
  
  await handleRequestOtp(e);
}

// Setup event listeners
function setupEventListeners() {
  // Request OTP button
  if (requestOtpBtn) {
    requestOtpBtn.addEventListener('click', handleRequestOtp);
  }
  
  // Verify OTP button
  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', handleVerifyOtp);
  }
  
  // Complete signup button
  if (completeSignupBtn) {
    completeSignupBtn.addEventListener('click', handleCompleteSignup);
  }
  
  // Previous buttons
  prevButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      showStep(currentStep - 1);
    });
  });
  
  // Resend OTP link
  if (resendOtpLink) {
    resendOtpLink.addEventListener('click', handleResendOtp);
  }
  
  // Handle Enter key
  form.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (currentStep === 0) {
        handleRequestOtp(e);
      } else if (currentStep === 1) {
        handleVerifyOtp(e);
      } else if (currentStep === 2) {
        handleCompleteSignup(e);
      }
    }
  });
  
  // Email input - reset OTP state when email changes
  if (emailInput) {
    emailInput.addEventListener('input', () => {
      otpSent = false;
      otpVerified = false;
    });
  }
}

// Validate current step
function validateCurrentStep() {
  const currentStepElement = steps[currentStep];
  const inputs = Array.from(currentStepElement.querySelectorAll('input[required]'));
  
  // Clear previous errors
  clearMessages();
  
  // Validate each input in the current step
  for (const input of inputs) {
    const value = input.value.trim();
    
    // Check for empty required fields
    if (!value) {
      showError('Please fill in all required fields');
      input.focus();
      return false;
    }
    
    // Email validation
    if (input.type === 'email') {
      if (!isValidEmail(value)) {
        showError('Please enter a valid email address');
        input.focus();
        return false;
      }
      
      // Check company email domain
      if (!value.endsWith('@chemo.in')) {
        showError('Please use your company email address (@chemo.in)');
        input.focus();
        return false;
      }
    }
    
    // Username validation
    if (input.id === 'username') {
      if (value.length < 3) {
        showError('Username must be at least 3 characters long');
        input.focus();
        return false;
      }
      
      if (!/^[a-zA-Z0-9_]+$/.test(value)) {
        showError('Username can only contain letters, numbers, and underscores');
        input.focus();
        return false;
      }
    }
    
    // Password validation
    if (input.id === 'password') {
      if (value.length < 8) {
        showError('Password must be at least 8 characters long');
        input.focus();
        return false;
      }
      
      if (!value.match(/[a-z]+/)) {
        showError('Password must contain at least one lowercase letter');
        input.focus();
        return false;
      }
      
      if (!value.match(/[A-Z]+/)) {
        showError('Password must contain at least one uppercase letter');
        input.focus();
        return false;
      }
      
      if (!value.match(/[0-9]+/)) {
        showError('Password must contain at least one number');
        input.focus();
        return false;
      }
      
      // Check password strength
      if (!checkPasswordStrength(value)) {
        showError('Please choose a stronger password');
        input.focus();
        return false;
      }
    }
    
    // Confirm password validation
    if (input.id === 'confirmPassword') {
      const password = document.getElementById('password').value;
      if (value !== password) {
        showError('Passwords do not match');
        input.focus();
        return false;
      }
    }
  }
  
  return true;
}

// Handle OTP request
async function handleRequestOtp(e) {
  e.preventDefault();
  
  const email = emailInput.value.trim();
  
  // Clear any previous messages
  clearMessages();
  
  // Validate email
  if (!email) {
    showError('Email address is required');
    emailInput.focus();
    return;
  }
  
  if (!isValidEmail(email)) {
    showError('Please enter a valid email address');
    emailInput.focus();
    return;
  }
  
  // Check if email ends with @chemo.in
  if (!email.endsWith('@chemo.in')) {
    showError('Please use your company email address (@chemo.in)');
    emailInput.focus();
    return;
  }
  
  try {
    setLoading(true, 'requestOtpBtn');
    
    const response = await fetch('/api/request-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        type: 'verification'
      }),
    });
    
    const result = await response.json().catch(() => ({
      success: false,
      error: 'Failed to send verification code'
    }));
    
    if (result.success) {
      currentEmail = email; // Store the email for later use
      showStep(1); // Move to OTP verification step
      
      // Update the email display in the OTP step
      const emailDisplay = document.getElementById('emailDisplay');
      if (emailDisplay) {
        emailDisplay.textContent = email;
      }
      
      // Clear and focus the OTP input
      otpInput.value = '';
      otpInput.focus();
      
      // Start the resend countdown
      startResendCountdown();
      
      // Show success message
      showSuccess(result.message || 'Verification code sent successfully');
    } else {
      const errorMessage = result.error || result.message || 'Failed to send verification code. Please try again.';
      showError(errorMessage);
      
      // If email is already registered, suggest login
      if (errorMessage.includes('already registered')) {
        const loginLink = document.createElement('a');
        loginLink.href = '/login';
        loginLink.textContent = 'Sign in here';
        loginLink.className = 'login-suggestion';
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'hint';
        messageDiv.textContent = 'Already have an account? ';
        messageDiv.appendChild(loginLink);
        
        const messageContainer = document.querySelector('#step1 .message');
        if (messageContainer) {
          messageContainer.appendChild(messageDiv);
        }
      }
    }
  } catch (error) {
    console.error('OTP request error:', error);
    showError('Failed to send verification code. Please check your connection and try again.');
  } finally {
    setLoading(false, 'requestOtpBtn');
  }
}

// Handle OTP verification
async function handleVerifyOtp(e) {
  e.preventDefault();
  
  const otp = otpInput.value.trim();
  
  if (!otp || otp.length !== 6) {
    showError('Please enter a valid 6-digit OTP');
    otpInput.focus();
    return;
  }
  
  try {
    setLoading(true, 'verifyOtpBtn');
    
    const response = await fetch('/api/verify-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: currentEmail,
        otp,
        type: 'verification'
      }),
    });
    
    const result = await response.json().catch(() => ({
      success: false,
      error: 'Failed to verify OTP'
    }));
    
    if (result.success) {
      otpVerified = true;
      showStep(2); // Move to account setup
      usernameInput.focus();
      
      // Clear any previous error messages
      clearMessages();
    } else {
      const errorMessage = result.error || result.message || 'Invalid OTP. Please try again.';
      showError(errorMessage);
      
      // Clear the OTP input on error
      otpInput.value = '';
      otpInput.focus();
    }
  } catch (error) {
    console.error('OTP verification error:', error);
    showError('Failed to verify OTP. Please check your connection and try again.');
    
    // Clear the OTP input on error
    otpInput.value = '';
    otpInput.focus();
  } finally {
    setLoading(false, 'verifyOtpBtn');
  }
}

// Handle signup completion
async function handleCompleteSignup(e) {
  e.preventDefault();
  
  if (!validateCurrentStep()) {
    return;
  }
  
  // Check if terms are accepted
  const termsCheckbox = document.getElementById('terms');
  if (!termsCheckbox.checked) {
    showError('You must accept the terms and conditions');
    return;
  }
  
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const otp = otpInput.value.trim();
  
  try {
    setLoading(true, 'completeSignupBtn');
    
    const response = await fetch('/api/auth/register/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: currentEmail,
        username,
        password,
        otp,
        confirmPassword: password // Add confirmPassword to match backend expectation
      }),
    });
    
    const result = await response.json().catch(() => ({}));
    
    if (response.ok) {
      // Show success message and redirect
      showStep(3); // Show success step
      
      // Show success message
      const successMessage = document.createElement('div');
      successMessage.className = 'success-message';
      successMessage.textContent = result.message || 'Registration successful! Redirecting to login...';
      document.querySelector('#successStep p').textContent = result.message || 'Your account has been created successfully. You can now sign in.';
      
      // Clear form data
      form.reset();
      
      // Redirect to index.html after successful signup
      setTimeout(() => {
        window.location.href = result.redirectTo || '/index';
      }, 1000);
    } else {
      // Show error message
      const errorMessage = result.error || 'Registration failed. Please try again.';
      showError(errorMessage);
      
      // If OTP is invalid, go back to OTP step
      if (errorMessage.includes('verification code')) {
        showStep(1);
      }
    }
  } catch (error) {
    console.error('Registration error:', error);
    showError('An error occurred. Please check your connection and try again.');
  } finally {
    setLoading(false, 'completeSignupBtn');
  }
}

// Handle form submission
async function handleSubmit(e) {
  e.preventDefault();
  
  if (!validateCurrentStep()) {
    return;
  }
  
  // Show loading state
  setLoading(true);
  
  try {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Remove confirmPassword field before sending
    delete data.confirmPassword;
    
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    const result = await response.json();
    
    if (response.ok) {
      // Registration successful
      showSuccess('Registration successful! Redirecting to login...');
      
      // Store user data in localStorage
      if (result.token) {
        localStorage.setItem('token', result.token);
      }
      
      // Redirect to login page after a delay
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } else {
      // Handle errors
      showError(result.message || 'Registration failed. Please try again.');
    }
  } catch (error) {
    console.error('Registration error:', error);
    showError('An error occurred. Please try again.');
  } finally {
    setLoading(false);
  }
}

// Get step-specific message div
function getMessageDiv(stepIndex) {
  return steps[stepIndex].querySelector('.message');
}

// Show error message
function showError(message) {
  const currentMessageDiv = getMessageDiv(currentStep);
  if (currentMessageDiv) {
    currentMessageDiv.textContent = message;
    currentMessageDiv.className = 'message error';
    currentMessageDiv.style.display = 'block';
    currentMessageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Show success message
function showSuccess(message) {
  const currentMessageDiv = getMessageDiv(currentStep);
  if (currentMessageDiv) {
    currentMessageDiv.textContent = message;
    currentMessageDiv.className = 'message success';
    currentMessageDiv.style.display = 'block';
    currentMessageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Clear messages for current step
function clearMessages() {
  const currentMessageDiv = getMessageDiv(currentStep);
  if (currentMessageDiv) {
    currentMessageDiv.textContent = '';
    currentMessageDiv.style.display = 'none';
    currentMessageDiv.className = 'message';
  }
}

// Set loading state for a button
function setLoading(isLoading, buttonId = null) {
  if (buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.disabled = isLoading;
      button.classList.toggle('loading', isLoading);
      
      const buttonText = button.querySelector('.btn-text');
      const buttonLoader = button.querySelector('.btn-loader');
      
      if (buttonText && buttonLoader) {
        buttonText.style.visibility = isLoading ? 'hidden' : 'visible';
        buttonLoader.style.display = isLoading ? 'flex' : 'none';
      }
    }
  } else {
    // Set loading state for all buttons in the current step
    const buttons = steps[currentStep].querySelectorAll('button');
    buttons.forEach(button => {
      button.disabled = isLoading;
    });
    
    // Special handling for submit button
    if (submitButton) {
      submitButton.disabled = isLoading;
      submitButton.classList.toggle('loading', isLoading);
      
      const buttonText = submitButton.querySelector('.btn-text');
      const buttonLoader = submitButton.querySelector('.btn-loader');
      
      if (buttonText && buttonLoader) {
        buttonText.style.visibility = isLoading ? 'hidden' : 'visible';
        buttonLoader.style.display = isLoading ? 'flex' : 'none';
      }
    }
  }
}

// Validate email format
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.endsWith('@chemo.in');
}

// Password strength checker
function checkPasswordStrength(password) {
  let strength = 0;
  const strengthBar = document.getElementById('strengthBar');
  const strengthText = document.getElementById('strengthText');
  
  // Reset
  if (!password) {
    strengthBar.className = 'strength-bar';
    strengthBar.style.width = '0%';
    if (strengthText) {
      strengthText.textContent = '';
      strengthText.className = 'strength-text';
    }
    return false;
  }
  
  // Reset classes
  strengthBar.className = 'strength-bar';
  
  // Check password length
  if (password.length >= 8) strength += 1;
  
  // Check for lowercase letters
  if (password.match(/[a-z]+/)) strength += 1;
  
  // Check for uppercase letters
  if (password.match(/[A-Z]+/)) strength += 1;
  
  // Check for numbers
  if (password.match(/[0-9]+/)) strength += 1;
  
  // Check for special characters
  if (password.match(/[!@#$%^&*(),.?":{}|<>]+/)) strength += 1;
  
  // Update the strength bar
  let strengthClass = 'weak';
  let strengthMessage = 'Weak';
  
  if (strength <= 2) {
    strengthClass = 'weak';
    strengthMessage = 'Weak';
  } else if (strength === 3) {
    strengthClass = 'moderate';
    strengthMessage = 'Moderate';
  } else {
    strengthClass = 'strong';
    strengthMessage = 'Strong';
  }
  
  // Update the UI
  strengthBar.classList.add(strengthClass);
  strengthBar.style.width = (strength / 5 * 100) + '%';
  
  if (strengthText) {
    strengthText.textContent = strengthMessage;
    strengthText.className = 'strength-text ' + strengthClass;
  }
  
  return strength >= 3; // Return true if password is at least moderate strength
}

// Toggle password visibility
function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  const icon = document.querySelector(`[data-toggle="${inputId}"]`);
  
  if (!input || !icon) return;
  
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

// Initialize the form when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initForm();
  
  // Add password strength checker
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('input', (e) => {
      checkPasswordStrength(e.target.value);
    });
  }
  
  // Add password match checker
  const confirmPasswordInput = document.getElementById('confirmPassword');
  if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener('input', () => {
      const password = document.getElementById('password').value;
      const confirmPassword = confirmPasswordInput.value;
      
      if (confirmPassword && password !== confirmPassword) {
        confirmPasswordInput.setCustomValidity('Passwords do not match');
      } else {
        confirmPasswordInput.setCustomValidity('');
      }
    });
  }
  
  // Add toggle password visibility handlers
  document.querySelectorAll('.toggle-password').forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const inputId = button.getAttribute('data-toggle');
      togglePasswordVisibility(inputId);
    });
  });
});
