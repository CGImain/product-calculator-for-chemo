// Handles company change flow on product pages
(function(){
    document.addEventListener('DOMContentLoaded', () => {
        const wrapper = document.getElementById('companyInfoWrapper');
        if (!wrapper) return;

        const bar = document.getElementById('companyInfoBar');
        const searchBox = document.getElementById('companySearchBox');
        const changeBtn = document.getElementById('companyChangeBtn');
        const cancelBtn = document.getElementById('companyCancelBtn');
        const confirmBtn = document.getElementById('companyConfirmBtn');
        const searchInput = document.getElementById('companySearchInput');
        const searchResults = document.getElementById('companySearchResults');
        const nameDisplay = document.getElementById('companyNameDisplay');
        const emailDisplay = document.getElementById('companyEmailDisplay');
        const companyInfoContainer = document.getElementById('companyInfoContainer');

        let companies = [];
        let selected = null;

        // Function to update company display
        function updateCompanyDisplay(name, email) {
            if (nameDisplay) nameDisplay.textContent = name ||'';
            if (emailDisplay) emailDisplay.textContent = email || '';
            
            // Show/hide email container based on whether we have an email
            if (companyInfoContainer) {
                companyInfoContainer.style.display = email ? 'flex' : 'none';
            }
        }

        // Initialize company info from the page load
        function initCompanyInfo() {
            // First try to get from server-side rendered elements
            const serverName = document.getElementById('serverCompanyName')?.textContent.trim();
            const serverEmail = document.getElementById('serverCompanyEmail')?.textContent.trim();
            
            // If we have server-side values, use them
            if (serverName || serverEmail) {
                updateCompanyDisplay(serverName, serverEmail);
                return;
            }
            
            // Fall back to any existing display values
            const displayName = nameDisplay?.textContent.trim() || '';
            const displayEmail = emailDisplay?.textContent.trim() || '';
            
            // If we have a company name but no email, try to find it in the companies list
            if (displayName && !displayEmail && companies.length > 0) {
                const company = companies.find(c => c.name === displayName);
                if (company) {
                    updateCompanyDisplay(company.name, company.email);
                }
            }
        }

        // Load companies from the server
        async function loadCompanies() {
            if (companies.length) return companies;
            
            try {
                const response = await fetch('/api/companies');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                companies = await response.json();
                return companies;
            } catch (error) {
                console.error('Error loading companies:', error);
                showToast('Failed to load companies. Please try again.', 'error');
                return [];
            }
        }

        // Render search results
        function renderResults(companies) {
            if (!searchResults) return;
            
            if (!companies || companies.length === 0) {
                searchResults.innerHTML = '<div class="p-2 text-muted">No matching companies found</div>';
                searchResults.style.display = 'block';
                return;
            }
            
            searchResults.innerHTML = companies.map(company => `
                <div class="search-item p-2 border-bottom" data-id="${company.id}">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="fw-bold">${company.name || 'Unnamed Company'}</div>
                            <div class="small text-muted">${company.email || 'No email'}</div>
                        </div>
                        <button class="btn btn-sm btn-outline-primary select-company-btn" data-id="${company.id}">
                            <i class="bi bi-check-lg"></i> Select
                        </button>
                    </div>
                </div>
            `).join('');
            
            // Add click handlers to search results
            document.querySelectorAll('.search-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    // Don't trigger if the click was on the select button
                    if (e.target.closest('.select-company-btn')) return;
                    
                    const companyId = item.getAttribute('data-id');
                    const company = companies.find(c => c.id === companyId);
                    if (company) {
                        selectCompany(company);
                    }
                });
            });
            
            // Add click handlers to select buttons
            document.querySelectorAll('.select-company-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const companyId = btn.getAttribute('data-id');
                    const company = companies.find(c => c.id === companyId);
                    if (company) {
                        // Update the selection and immediately confirm
                        selectCompany(company);
                        updateCompany(company);
                    }
                });
            });
            
            searchResults.style.display = 'block';
        }

        // Select a company from search results
        function selectCompany(company) {
            if (!company) return;
            
            selected = company;
            if (searchInput) searchInput.value = company.name;
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i> Select';
            }
            
            // Hide search results immediately
            if (searchResults) {
                searchResults.style.display = 'none';
            }
            
            // Update the display right away for better UX (preview only)
            const nameDisplay = document.getElementById('companyNameDisplay');
            const emailDisplay = document.getElementById('companyEmailDisplay');
            const companyInfoContainer = document.getElementById('companyInfoContainer');
            
            if (nameDisplay) nameDisplay.textContent = company.name;
            if (emailDisplay) emailDisplay.textContent = company.email || '';
            if (companyInfoContainer) companyInfoContainer.style.display = 'flex';
        }

        // Reset the search interface
        function resetSearch() {
            if (searchInput) searchInput.value = '';
            if (searchResults) {
                searchResults.innerHTML = '';
                searchResults.style.display = 'none';
            }
            if (confirmBtn) confirmBtn.disabled = true;
            selected = null;
        }

        // Update the selected company
        async function updateCompany(company) {
            if (!company) {
                showToast('No company selected', 'warning');
                return;
            }
            
            try {
                // Show loading state
                if (confirmBtn) {
                    confirmBtn.disabled = true;
                    confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Updating...';
                }
                
                // First, try to get the CSRF token from the meta tag
                let csrfToken = '';
                const csrfMeta = document.querySelector('meta[name="csrf-token"]');
                if (csrfMeta) {
                    csrfToken = csrfMeta.getAttribute('content');
                }
                
                const response = await fetch('/api/update_company', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken || getCookie('csrftoken') || '',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({
                        company_id: company.id,
                        company_name: company.name,
                        company_email: company.email
                    }),
                    credentials: 'same-origin'  // Include cookies for session
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.message || 'Failed to update company');
                }
                
                // Update the UI immediately
                updateCompanyDisplay(company.name, company.email);
                
                // Hide search box and show info bar
                if (searchBox) searchBox.style.display = 'none';
                if (bar) bar.style.display = 'block';
                
                // Reset search
                resetSearch();
                
                // Store in sessionStorage for immediate UI updates
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem('selectedCompany', JSON.stringify(company));
                }
                
                // Update the selected company in the session
                try {
                    const sessionResponse = await fetch('/api/session/update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': csrfToken || getCookie('csrftoken') || '',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        body: JSON.stringify({
                            selected_company: {
                                id: company.id,
                                name: company.name,
                                email: company.email
                            }
                        }),
                        credentials: 'same-origin'
                    });
                    
                    if (!sessionResponse.ok) {
                        console.warn('Failed to update session, but company was updated');
                    }
                } catch (e) {
                    console.warn('Error updating session:', e);
                }
                
                // Show success message after updating the UI
                showToast(`Company updated to ${company.name}`, 'success');
                
            } catch (error) {
                console.error('Error updating company:', error);
                showToast(error.message || 'Failed to update company. Please try again.', 'error');
                
                // Reset button state
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i> Select';
                }
            }
        }
        
        // Helper function to get CSRF token from cookies
        function getCookie(name) {
            let cookieValue = null;
            if (document.cookie && document.cookie !== '') {
                const cookies = document.cookie.split(';');
                for (let i = 0; i < cookies.length; i++) {
                    const cookie = cookies[i].trim();
                    if (cookie.substring(0, name.length + 1) === (name + '=')) {
                        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                        break;
                    }
                }
            }
            return cookieValue;
        }

        // Show a toast message
        function showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : 'success'} border-0`;
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', 'assertive');
            toast.setAttribute('aria-atomic', 'true');
            
            toast.innerHTML = `
                <div class="d-flex">
                    <div class="toast-body">
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            `;
            
            const toastContainer = document.getElementById('toastContainer');
            if (toastContainer) {
                toastContainer.appendChild(toast);
                const bsToast = new bootstrap.Toast(toast, { autohide: true, delay: 3000 });
                bsToast.show();
                
                // Remove toast after it's hidden
                toast.addEventListener('hidden.bs.toast', () => {
                    toast.remove();
                });
            }
        }

        // Event handlers
        changeBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                await loadCompanies();
                if (bar) bar.style.display = 'none';
                if (searchBox) searchBox.style.display = 'block';
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.focus();
                }
                if (searchResults) {
                    searchResults.innerHTML = '';
                    searchResults.style.display = 'none';
                }
                if (confirmBtn) {
                    confirmBtn.disabled = true;
                    confirmBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i> Select';
                }
                // Clear any previous selection
                selected = null;
            } catch (error) {
                console.error('Error showing company search:', error);
                showToast('Failed to load company search. Please try again.', 'error');
            }
        });

        cancelBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Restore original company info if available
            const storedCompany = sessionStorage.getItem('selectedCompany');
            if (storedCompany) {
                const company = JSON.parse(storedCompany);
                updateCompanyDisplay(company.name, company.email);
            }
            
            if (bar) bar.style.display = 'block';
            if (searchBox) searchBox.style.display = 'none';
            resetSearch();
            
            // Clear selection
            selected = null;
        });

        confirmBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!selected) {
                showToast('Please select a company first', 'warning');
                return;
            }
            
            // Update the company when the user clicks the Select button
            updateCompany(selected);
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const isClickInside = wrapper?.contains(e.target);
            if (!isClickInside && searchBox && searchBox.style.display === 'block') {
                if (bar) bar.style.display = 'block';
                searchBox.style.display = 'none';
                resetSearch();
            }
        });

        // Debounced search input handler
        function debounce(fn, delay = 300) {
            let timeoutId;
            return function(...args) {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => fn.apply(this, args), delay);
            };
        }

        searchInput?.addEventListener('input', debounce(async (e) => {
            const term = e.target.value.trim().toLowerCase();
            
            if (!term) {
                if (searchResults) {
                    searchResults.innerHTML = '';
                    searchResults.style.display = 'none';
                }
                if (confirmBtn) confirmBtn.disabled = true;
                return;
            }
            
            // If we don't have companies loaded yet, load them
            if (companies.length === 0) {
                await loadCompanies();
            }
            
            // Filter companies
            const filtered = companies.filter(company => 
                (company.name && company.name.toLowerCase().includes(term)) || 
                (company.email && company.email.toLowerCase().includes(term))
            );
            
            // Sort by relevance (starts with first)
            filtered.sort((a, b) => {
                const aName = a.name ? a.name.toLowerCase() : '';
                const bName = b.name ? b.name.toLowerCase() : '';
                const aStarts = aName.startsWith(term) ? 0 : 1;
                const bStarts = bName.startsWith(term) ? 0 : 1;
                
                if (aStarts !== bStarts) {
                    return aStarts - bStarts;
                }
                
                return aName.localeCompare(bName);
            });
            
            renderResults(filtered);
        }));

        // Initialize the company info component
        function init() {
            // Initialize company info from server-side data
            initCompanyInfo();
            
            // Set up event listeners
            setupEventListeners();
            
            // Load companies in the background
            loadCompanies().catch(error => {
                console.error('Error loading companies:', error);
                showToast('Failed to load companies. Please refresh the page.', 'error');
            });
            
            console.log('Company info component initialized');
        }
        
        // Set up all event listeners
        function setupEventListeners() {
            // Initialize Bootstrap tooltips
            const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
            tooltipTriggerList.forEach(tooltipTriggerEl => {
                new bootstrap.Tooltip(tooltipTriggerEl);
            });
            
            // Handle window resize to adjust UI if needed
            window.addEventListener('resize', handleResize);
        }
        
        // Handle window resize
        function handleResize() {
            // Add any responsive behavior here if needed
        }
        
        // Make functions available globally
        window.updateCompanyDisplay = updateCompanyDisplay;
        
        // Initialize the component when the DOM is fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    });
})();
