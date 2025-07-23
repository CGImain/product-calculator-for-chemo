// Check if we're coming from a company change action
const urlParams = new URLSearchParams(window.location.search);
const fromChange = urlParams.get('from') === 'change';

document.addEventListener('DOMContentLoaded', async function() {
    const searchInput = document.getElementById('companyInput');
    const searchResults = document.getElementById('searchResults');
    const companyForm = document.getElementById('companyForm');
    const selectButton = document.getElementById('selectCompanyBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    let companiesData = [];
    let selectedCompany = null;
    
    // If we're coming from a company change, clear any existing company selection
    if (fromChange) {
        localStorage.removeItem('selectedCompany');
        sessionStorage.removeItem('selectedCompany');
    }

    // Show loading indicator
    function showLoading() {
        loadingIndicator.style.display = 'block';
        searchResults.style.display = 'none';
    }

    // Hide loading indicator
    function hideLoading() {
        loadingIndicator.style.display = 'none';
        searchResults.style.display = 'block';
    }

    // Load companies from the server
    async function loadCompanies() {
        showLoading();
        try {
            const response = await fetch('/get_companies', {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            companiesData = await response.json();
            console.log('Loaded companies:', companiesData);
            
            if (companiesData.length === 0) {
                searchResults.innerHTML = `
                    <div class="alert alert-warning">
                        No companies found. Please contact support.
                    </div>`;
            }
        } catch (error) {
            console.error('Error loading companies:', error);
            searchResults.innerHTML = `
                <div class="alert alert-danger">
                    Error loading companies. Please refresh the page or try again later.
                    <div class="small">${error.message}</div>
                </div>`;
        } finally {
            hideLoading();
        }
    }
    
    // Initialize
    loadCompanies();

    // Handle search input with debounce
    let searchTimeout;
    searchInput.addEventListener('input', function(e) {
        clearTimeout(searchTimeout);
        const searchTerm = e.target.value.trim().toLowerCase();
        
        // Clear results if search is empty
        if (!searchTerm) {
            searchResults.innerHTML = '';
            selectButton.disabled = true;
            return;
        }
        
        // Show loading indicator
        showLoading();
        
        // Debounce search to avoid too many requests
        searchTimeout = setTimeout(() => {
            try {
                // Simple client-side filtering
                const filteredCompanies = companiesData.filter(company => 
                    company.name.toLowerCase().includes(searchTerm) || 
                    company.email.toLowerCase().includes(searchTerm)
                );
                
                // Sort by relevance (exact matches first, then partial matches)
                filteredCompanies.sort((a, b) => {
                    const aName = a.name.toLowerCase();
                    const bName = b.name.toLowerCase();
                    const aMatch = aName.startsWith(searchTerm) ? 0 : 1;
                    const bMatch = bName.startsWith(searchTerm) ? 0 : 1;
                    if (aMatch !== bMatch) return aMatch - bMatch;
                    return aName.localeCompare(bName);
                });
                
                // Display results
                if (filteredCompanies.length > 0) {
                    searchResults.innerHTML = filteredCompanies.map(company => `
                        <div class="search-item p-2 border-bottom" 
                             data-id="${company.id}" 
                             data-name="${company.name}" 
                             data-email="${company.email}">
                            <div class="fw-bold">${company.name}</div>
                            <div class="small text-muted">${company.email}</div>
                        </div>`
                    ).join('');
                } else {
                    searchResults.innerHTML = `
                        <div class="p-3 text-muted">
                            No companies found. Try a different search term.
                        </div>`;
                }
            } catch (error) {
                console.error('Error filtering companies:', error);
                searchResults.innerHTML = `
                    <div class="alert alert-danger">
                        Error filtering companies. Please try again.
                    </div>`;
            } finally {
                hideLoading();
            }
        }, 300); // 300ms debounce
    });
    
    // Handle click on search result item
    searchResults.addEventListener('click', function(e) {
        const item = e.target.closest('.search-item');
        if (!item) return;
        
        // Update selected company
        selectedCompany = {
            id: item.dataset.id,
            name: item.dataset.name,
            email: item.dataset.email
        };
        
        // Update form fields
        document.getElementById('companyId').value = selectedCompany.id;
        document.getElementById('companyName').value = selectedCompany.name;
        document.getElementById('companyEmail').value = selectedCompany.email;
        
        // Update UI
        searchInput.value = selectedCompany.name;
        searchResults.innerHTML = '';
        selectButton.disabled = false;
    });
    
    // Handle form submission
    companyForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!selectedCompany) {
            alert('Please select a company first');
            return;
        }
        
        // Show loading state
        const originalButtonText = selectButton.innerHTML;
        selectButton.disabled = true;
        selectButton.innerHTML = `
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            Processing...
        `;
        
        try {
            // Submit the form normally (with CSRF token)
            companyForm.submit();
        } catch (error) {
            console.error('Error submitting form:', error);
            alert('An error occurred. Please try again.');
            selectButton.disabled = false;
            selectButton.innerHTML = originalButtonText;
        }
    });
    
    // Close search results when clicking outside
    document.addEventListener('click', function(e) {
        if (!searchResults.contains(e.target) && e.target !== searchInput) {
            searchResults.innerHTML = '';
        }
    });
    
    // Handle keyboard navigation
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            searchResults.innerHTML = '';
            return;
        }
        
        if (e.key === 'Enter' && selectedCompany) {
            e.preventDefault();
            companyForm.dispatchEvent(new Event('submit'));
        }
    });

    // Handle form submission
    document.getElementById('companyForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const selectedCompany = localStorage.getItem('selectedCompany');
        
        if (!selectedCompany) {
            alert('Please select a company');
            return;
        }

        // Submit the form
        this.submit();
    });
});
