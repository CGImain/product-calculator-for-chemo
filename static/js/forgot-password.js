// DOM Elements
const form = document.getElementById('forgotPasswordForm');
const emailInput = document.getElementById('email');
const otpInput = document.getElementById('otp');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const requestOtpBtn = document.getElementById('requestOtpBtn');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const resetPasswordBtn = document.getElementById('resetPasswordBtn');
const resendOtpLink = document.getElementById('resendOtp');
const messageDiv = document.getElementById('message');
const emailDisplay = document.getElementById('emailDisplay');

// Steps
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');

let currentStep = 1;
let otpRequested = false;
let otpVerified = false;
let otpTimer;
let resendTimeout = 30; // 30 seconds cooldown for resend OTP

// Initialize the form
document.addEventListener('DOMContentLoaded', () => {
  showStep(1);
  setupEventListeners();
});

// Show specific step
function showStep(stepNumber) {
  // Hide all steps
  [step1, step2, step3].forEach(step => {
    if (step) step.style.display = 'none';
  });
  
  // Show the current step
  const currentStepElement = document.getElementById(`step${stepNumber}`);
  if (currentStepElement) {
    currentStepElement.style.display = 'block';
  }
  
  currentStep = stepNumber;
  
  // Focus on the first input of the current step
  const firstInput = currentStepElement?.querySelector('input');
  if (firstInput) {
    firstInput.focus();
  }
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
  
  // Reset Password button
  if (resetPasswordBtn) {
    resetPasswordBtn.addEventListener('click', handleResetPassword);
  }
  
  // Resend OTP link
  if (resendOtpLink) {
    resendOtpLink.addEventListener('click', handleResendOtp);
  }
  
  // Form submission
  if (form) {
    form.addEventListener('submit', (e) => e.preventDefault());
  }
  
  // Input field enter key support
  const inputs = [emailInput, otpInput, newPasswordInput, confirmPasswordInput];
  inputs.forEach(input => {
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (currentStep === 1) {
            handleRequestOtp();
          } else if (currentStep === 2) {
            handleVerifyOtp();
          } else if (currentStep === 3) {
            handleResetPassword();
          }
        }
      });
    }
  });
  
  // Password confirmation validation
  if (newPasswordInput && confirmPasswordInput) {
    [newPasswordInput, confirmPasswordInput].forEach(input => {
      input.addEventListener('input', validatePasswordMatch);
    });
  }
}

// Handle Request OTP
async function handleRequestOtp() {
  const email = emailInput?.value.trim();
  
  // Validate email
  if (!email) {
    showError('Please enter your email address');
    emailInput?.focus();
    return;
  }
  
  if (!isValidEmail(email)) {
    showError('Please enter a valid email address');
    emailInput?.focus();
    return;
  }
  
  try {
    setLoading(true, 'requestOtpBtn');
    
    // Call API to request OTP
    const response = await fetch('/api/auth/request-password-reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      showSuccess('A verification code has been sent to your email.');
      otpRequested = true;
      
      // Update email display
      if (emailDisplay) {
        emailDisplay.textContent = email;
      }
      
      // Start OTP resend timer
      startOtpResendTimer();
      
      // Move to OTP verification step
      showStep(2);
      otpInput?.focus();
    } else {
      showError(data.message || 'Failed to send verification code. Please try again.');
    }
  } catch (error) {
    console.error('Request OTP error:', error);
    showError('An error occurred. Please check your connection and try again.');
  } finally {
    setLoading(false, 'requestOtpBtn');
  }
}

// Handle Verify OTP
async function handleVerifyOtp() {
  const email = emailInput?.value.trim();
  const otp = otpInput?.value.trim();
  
  // Validate OTP
  if (!otp || !/^\d{6}$/.test(otp)) {
    showError('Please enter a valid 6-digit verification code');
    otpInput?.focus();
    return;
  }
  
  try {
    setLoading(true, 'verifyOtpBtn');
    
    // Call API to verify OTP
    const response = await fetch('/api/auth/verify-reset-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, otp }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      showSuccess('Email verified. You can now set a new password.');
      otpVerified = true;
      
      // Move to reset password step
      showStep(3);
      newPasswordInput?.focus();
    } else {
      showError(data.message || 'Invalid verification code. Please try again.');
      otpInput?.focus();
    }
  } catch (error) {
    console.error('Verify OTP error:', error);
    showError('An error occurred. Please try again.');
  } finally {
    setLoading(false, 'verifyOtpBtn');
  }
}

// Handle Reset Password
async function handleResetPassword() {
  const email = emailInput?.value.trim();
  const otp = otpInput?.value.trim();
  const newPassword = newPasswordInput?.value;
  const confirmPassword = confirmPasswordInput?.value;
  
  // Validate password
  if (!newPassword) {
    showError('Please enter a new password');
    newPasswordInput?.focus();
    return;
  }
  
  if (newPassword.length < 8) {
    showError('Password must be at least 8 characters long');
    newPasswordInput?.focus();
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showError('Passwords do not match');
    confirmPasswordInput?.focus();
    return;
  }
  
  try {
    setLoading(true, 'resetPasswordBtn');
    
    // Call API to reset password
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email, 
        otp, 
        newPassword 
      }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      showSuccess('Your password has been reset successfully. Redirecting to login...');
      
      // Redirect to login page after a delay
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } else {
      showError(data.message || 'Failed to reset password. Please try again.');
    }
  } catch (error) {
    console.error('Reset password error:', error);
    showError('An error occurred. Please try again.');
  } finally {
    setLoading(false, 'resetPasswordBtn');
  }
}

// Handle Resend OTP
async function handleResendOtp(e) {
  if (e) e.preventDefault();
  
  if (resendOtpLink?.classList.contains('disabled')) {
    return; // Prevent multiple clicks during cooldown
  }
  
  const email = emailInput?.value.trim();
  
  try {
    setLoading(true, 'resendOtp');
    
    // Call API to resend OTP
    const response = await fetch('/api/auth/request-password-reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email, 
        resend: true 
      }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      showSuccess('A new verification code has been sent to your email.');
      startOtpResendTimer();
    } else {
      showError(data.message || 'Failed to resend verification code. Please try again.');
    }
  } catch (error) {
    console.error('Resend OTP error:', error);
    showError('An error occurred. Please try again.');
  } finally {
    setLoading(false, 'resendOtp');
  }
}

// Start OTP resend timer
function startOtpResendTimer() {
  clearInterval(otpTimer);
  
  let timeLeft = resendTimeout;
  updateResendButton(timeLeft);
  
  otpTimer = setInterval(() => {
    timeLeft--;
    
    if (timeLeft <= 0) {
      clearInterval(otpTimer);
      if (resendOtpLink) {
        resendOtpLink.textContent = 'Resend Code';
        resendOtpLink.classList.remove('disabled');
      }
    } else {
      updateResendButton(timeLeft);
    }
  }, 1000);
}

// Update resend button text and state
function updateResendButton(seconds) {
  if (resendOtpLink) {
    resendOtpLink.textContent = `Resend Code in ${seconds}s`;
    resendOtpLink.classList.add('disabled');
  }
}

// Validate password match
function validatePasswordMatch() {
  if (!newPasswordInput || !confirmPasswordInput) return;
  
  if (newPasswordInput.value && confirmPasswordInput.value) {
    if (newPasswordInput.value !== confirmPasswordInput.value) {
      confirmPasswordInput.setCustomValidity('Passwords do not match');
    } else {
      confirmPasswordInput.setCustomValidity('');
    }
  }
}

// Show error message
function showError(message) {
  if (messageDiv) {
    messageDiv.textContent = message;
    messageDiv.className = 'message error';
    messageDiv.style.display = 'block';
  }
}

// Show success message
function showSuccess(message) {
  if (messageDiv) {
    messageDiv.textContent = message;
    messageDiv.className = 'message success';
    messageDiv.style.display = 'block';
  }
}

// Set loading state for a button
function setLoading(isLoading, buttonId) {
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
}

// Validate email format
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
