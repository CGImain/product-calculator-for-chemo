document.addEventListener('DOMContentLoaded', () => {
  const sendBtn = document.getElementById('sendQuotationBtn');
  if (!sendBtn) return;

  sendBtn.addEventListener('click', async () => {
    const notes = document.getElementById('quotationNotes').value || '';
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
        alert('Quotation sent successfully!');
        window.location.href = '/cart';
      } else {
        alert(data.error || 'Failed to send quotation');
      }
    } catch (err) {
      console.error(err);
      alert('Error sending quotation');
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> Send Quotation';
    }
  });
});
