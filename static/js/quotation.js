// Function to navigate to quotation preview
function goToQuotationPreview() {
  window.location.href = '/quotation_preview';
  return false;
}

// Function to handle quotation preview
document.addEventListener('DOMContentLoaded', () => {
  // Handle send quotation button
  const sendBtn = document.getElementById('sendQuotationBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      const notes = document.getElementById('quotationNotes')?.value || '';
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';

      try {
        const res = await fetch('/send_quotation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ notes })
        });
        const data = await res.json();
        
        if (data.success) {
          const message = data.email_sent ? 
            'Quotation sent successfully!' : 
            'Quotation processed successfully (email not sent - configuration missing)';
          
          showToast('Success', message, 'success');
          
          // Redirect to cart after a short delay
          setTimeout(() => {
            window.location.href = '/cart';
          }, 1500);
        } else {
          showToast('Error', data.error || 'Failed to process quotation', 'error');
        }
      } catch (err) {
        console.error('Error sending quotation:', err);
        showToast('Error', 'An error occurred while sending the quotation', 'error');
      } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> Send Quotation';
      }
    });
  }

  // Show toast notification
  function showToast(title, message, type = 'info') {
    // Check if toast container exists, if not create it
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.style.position = 'fixed';
      toastContainer.style.top = '20px';
      toastContainer.style.right = '20px';
      toastContainer.style.zIndex = '9999';
      document.body.appendChild(toastContainer);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast show align-items-center text-white bg-${type} border-0`;
    toast.role = 'alert';
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    // Toast content
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">
          <strong>${title}</strong><br>${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Auto-remove after delay
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }
});