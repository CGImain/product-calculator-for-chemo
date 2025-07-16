document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const emailInput = document.getElementById('email');
  const otpInput = document.getElementById('otp');
  const newPasswordInput = document.getElementById('new_password');
  const confirmPasswordInput = document.getElementById('confirm_password');
  
  const requestOtpBtn = document.getElementById('requestOtpBtn');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const resetPasswordBtn = document.getElementById('resetPasswordBtn');
  const resendOtpLink = document.getElementById('resendOtp');
  
  const steps = document.querySelectorAll('.step');
  const emailDisplay = document.getElementById('emailDisplay');

  let verifiedEmail = '';
  let verifiedOtp = '';
  let countdownTimer;

  function showStep(stepIndex) {
    steps.forEach((step, index) => {
      step.classList.toggle('active', index === stepIndex);
    });
    hideAllMessages();
  }

  function showMessage(stepIndex, message, type = 'error') {
    const step = steps[stepIndex];
    if (!step) return;
    const messageDiv = step.querySelector('.message');
    if (messageDiv) {
      messageDiv.textContent = message;
      messageDiv.className = `message ${type}`;
      messageDiv.style.display = 'block';
    }
  }

  function hideAllMessages() {
    document.querySelectorAll('.message').forEach(div => {
      div.style.display = 'none';
      div.textContent = '';
    });
  }

  function setLoading(button, isLoading) {
    if (!button) return;
    button.disabled = isLoading;
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');
    if (btnText) btnText.style.display = isLoading ? 'none' : 'block';
    if (btnLoader) btnLoader.style.display = isLoading ? 'flex' : 'none';
  }

  function startOtpResendTimer() {
    resendOtpLink.classList.add('disabled');
    resendOtpLink.innerHTML = 'Resend OTP in <span id="countdown">30</span>s';
    const newCountdownSpan = document.getElementById('countdown');
    let seconds = 30;
    if(newCountdownSpan) newCountdownSpan.textContent = seconds;

    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      seconds--;
      if(newCountdownSpan) newCountdownSpan.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(countdownTimer);
        resendOtpLink.classList.remove('disabled');
        resendOtpLink.textContent = 'Resend OTP';
      }
    }, 1000);
  }

  async function handleRequestOtp(isResend = false) {
    const email = isResend ? verifiedEmail : emailInput.value.trim();
    if (!email) {
      showMessage(0, 'Please enter your email address.');
      return;
    }

    const button = isResend ? resendOtpLink : requestOtpBtn;
    if (button.classList.contains('disabled')) return;
    
    setLoading(requestOtpBtn, true);
    if(isResend) resendOtpLink.classList.add('disabled');

    try {
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        if (!isResend) {
          verifiedEmail = email;
          if(emailDisplay) emailDisplay.textContent = email;
          showStep(1);
        }
        startOtpResendTimer();
        showMessage(1, 'A new verification code has been sent.', 'success');
      } else {
        const errorStep = isResend ? 1 : 0;
        showMessage(errorStep, data.error || 'An unexpected error occurred.');
      }
    } catch (error) {
      const errorStep = isResend ? 1 : 0;
      showMessage(errorStep, 'Could not connect to the server. Please try again later.');
    } finally {
      setLoading(requestOtpBtn, false);
    }
  }

  async function handleVerifyOtp() {
    const otp = otpInput.value.trim();
    if (!otp || otp.length !== 6) {
      showMessage(1, 'Please enter the 6-digit verification code.');
      return;
    }

    setLoading(verifyOtpBtn, true);
    try {
      const response = await fetch('/api/auth/verify-reset-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifiedEmail, otp }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        verifiedOtp = otp;
        clearInterval(countdownTimer);
        showStep(2);
      } else {
        showMessage(1, data.error || 'An unexpected error occurred.');
      }
    } catch (error) {
      showMessage(1, 'Could not connect to the server. Please try again later.');
    } finally {
      setLoading(verifyOtpBtn, false);
    }
  }

  async function handleResetPassword() {
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!newPassword || !confirmPassword) {
      showMessage(2, 'Please enter and confirm your new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage(2, 'Passwords do not match.');
      return;
    }

    setLoading(resetPasswordBtn, true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: verifiedEmail,
          otp: verifiedOtp,
          new_password: newPassword,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        showStep(3); // Show success step
        if (data.redirectTo) {
          setTimeout(() => {
            window.location.href = data.redirectTo;
          }, 3000);
        }
      } else {
        showMessage(2, data.error || 'An unexpected error occurred.');
      }
    } catch (error) {
      showMessage(2, 'Could not connect to the server. Please try again later.');
    } finally {
      setLoading(resetPasswordBtn, false);
    }
  }

  // Password visibility toggle for eye buttons
  document.querySelectorAll('.toggle-password').forEach((button) => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const input = button.parentElement.querySelector('input');
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        button.innerHTML = '<i class="fas fa-eye-slash"></i>';
      } else {
        input.type = 'password';
        button.innerHTML = '<i class="fas fa-eye"></i>';
      }
    });
  });

  // Event Listeners
  if (requestOtpBtn) requestOtpBtn.addEventListener('click', () => handleRequestOtp(false));
  if (verifyOtpBtn) verifyOtpBtn.addEventListener('click', handleVerifyOtp);
  if (resetPasswordBtn) resetPasswordBtn.addEventListener('click', handleResetPassword);
  if (resendOtpLink) {
    resendOtpLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (!resendOtpLink.classList.contains('disabled')) {
        handleRequestOtp(true);
      }
    });
  }

  // Initial setup
  showStep(0);
});
