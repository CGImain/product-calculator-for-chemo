# Product Calculator for Chemo
{% extends "base.html" %}

{% block title %}My Profile - Product Calculator{% endblock %}

{% block extra_css %}
<style>
    .profile-container {
        max-width: 1000px;
        margin: 2rem auto;
        padding: 2rem;
        background: white;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    }
    .profile-header {
        border-bottom: 1px solid #dee2e6;
        padding-bottom: 1rem;
        margin-bottom: 2rem;
    }
    .nav-tabs {
        border-bottom: 1px solid #dee2e6;
        margin-bottom: 1.5rem;
    }
    .nav-tabs .nav-link {
        border: none;
        color: #495057;
        font-weight: 500;
        padding: 0.75rem 1.5rem;
        margin-right: 0.5rem;
        border-radius: 0.25rem 0.25rem 0 0;
    }
    .nav-tabs .nav-link.active {
        color: #0d6efd;
        background-color: #fff;
        border-bottom: 3px solid #0d6efd;
    }
    .tab-content {
        padding: 1.5rem 0;
    }
    .quotation-item {
        border: 1px solid #dee2e6;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-bottom: 1rem;
        transition: all 0.2s;
    }
    .quotation-item:hover {
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.05);
    }
    .quotation-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid #f1f1f1;
    }
    .quotation-date {
        color: #6c757d;
        font-size: 0.875rem;
    }
    .quotation-total {
        font-weight: 600;
        color: #198754;
    }
    .no-quotations {
        text-align: center;
        padding: 2rem;
        color: #6c757d;
    }
    .loading-spinner {
        text-align: center;
        padding: 2rem;
    }
</style>
{% endblock %}

{% block content %}
<div class="profile-container">
    <div class="profile-header">
        <h2>My Profile</h2>
        <p class="text-muted">Manage your account and view your quotation history</p>
    </div>
    
    <ul class="nav nav-tabs" id="profileTabs" role="tablist">
        <li class="nav-item" role="presentation">
            <button class="nav-link active" id="account-tab" data-bs-toggle="tab" data-bs-target="#account" type="button" role="tab">
                My Account
            </button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link" id="history-tab" data-bs-toggle="tab" data-bs-target="#history" type="button" role="tab">
                Quotation History
            </button>
        </li>
    </ul>
    
    <div class="tab-content" id="profileTabContent">
        <!-- Account Tab -->
        <div class="tab-pane fade show active" id="account" role="tabpanel" aria-labelledby="account-tab">
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Account Information</h5>
                    <div id="accountInfo">
                        <div class="d-flex justify-content-center">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Quotation History Tab -->
        <div class="tab-pane fade" id="history" role="tabpanel" aria-labelledby="history-tab">
            <div id="quotationHistory">
                <div class="d-flex justify-content-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
{% endblock %}

{% block extra_js %}
<script>
// Handle API response with potential redirect
function handleApiResponse(response) {
    return response.json().then(data => {
        if (data.redirect) {
            window.location.href = data.redirect;
            return Promise.reject('Redirecting to company selection');
        }
        return data;
    });
}

// Load account information
fetch('/api/profile/account')
    .then(handleApiResponse)
    .then(data => {
        const accountInfo = document.getElementById('accountInfo');
        accountInfo.innerHTML = `
            <div class="mb-3">
                <label class="form-label fw-bold">Username</label>
                <p class="form-control-static">${data.username}</p>
            </div>
            <div class="mb-3">
                <label class="form-label fw-bold">Email Address</label>
                <p class="form-control-static">${data.email}</p>
            </div>
            <div class="mb-3">
                <label class="form-label fw-bold">Account Status</label>
                <p class="form-control-static">
                    ${data.is_verified 
                        ? '<span class="badge bg-success">Verified</span>' 
                        : '<span class="badge bg-warning">Pending Verification</span>'}
                </p>
            </div>
            <div class="mb-3">
                <label class="form-label fw-bold">Company</label>
                <p class="form-control-static">${data.company_name || 'Not specified'}</p>
            </div>
        `;
    })
    .catch(error => {
        console.error('Error loading account info:', error);
        document.getElementById('accountInfo').innerHTML = `
            <div class="alert alert-danger">
                Failed to load account information. Please try again later.
            </div>
        `;
    });

// Load quotation history when the tab is shown
document.getElementById('history-tab').addEventListener('shown.bs.tab', function () {
    const historyContainer = document.getElementById('quotationHistory');
    
    // Show loading state
    if (!historyContainer.innerHTML.includes('spinner-border')) {
        historyContainer.innerHTML = `
            <div class="d-flex justify-content-center">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>`;
    }
    
    fetch('/api/profile/quotation-history')
        .then(handleApiResponse)
        .then(quotations => {
            if (quotations.length === 0) {
                historyContainer.innerHTML = `
                    <div class="no-quotations">
                        <i class="bi bi-file-earmark-text" style="font-size: 3rem; opacity: 0.5;"></i>
                        <h5 class="mt-3">No Quotations Found</h5>
                        <p>Your quotation history will appear here.</p>
                    </div>`;
                return;
            }
            
            let html = '<div class="quotation-list">';
            
            quotations.forEach(quote => {
                const date = new Date(quote.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                html += `
                    <div class="quotation-item">
                        <div class="quotation-header">
                            <h6 class="mb-0">Quotation #${quote._id.substring(0, 8).toUpperCase()}</h6>
                            <div class="quotation-date">${date}</div>
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <div class="text-muted small">Sent to: ${quote.customer_email || 'N/A'}</div>
                                <div class="small">${quote.products ? quote.products.length : 0} items</div>
                            </div>
                            <div class="quotation-total">
                                ₹${quote.total ? quote.total.toLocaleString('en-IN', {minimumFractionDigits: 2}) : '0.00'}
                            </div>
                        </div>
                    </div>`;
            });
            
            html += '</div>';
            historyContainer.innerHTML = html;
        })
        .catch(error => {
            if (error !== 'Redirecting to company selection') {
                console.error('Error loading quotation history:', error);
                historyContainer.innerHTML = `
                    <div class="alert alert-danger">
                        Failed to load quotation history. Please try again later.
                    </div>`;
            }
        });
});

// Load initial data if on the history tab
if (window.location.hash === '#history') {
    document.getElementById('history-tab').click();
}
</script>
{% endblock %}
