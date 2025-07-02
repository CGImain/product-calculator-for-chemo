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
            if (nameDisplay) nameDisplay.textContent = name || 'No Company Selected';
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
                    <div class="fw-bold">${company.name || 'Unnamed Company'}</div>
                    <div class="small text-muted">${company.email || 'No email'}</div>
                </div>
            `).join('');
            
            // Add click handlers to search results
            document.querySelectorAll('.search-item').forEach(item => {
                item.addEventListener('click', () => {
                    const companyId = item.getAttribute('data-id');
                    const company = companies.find(c => c.id === companyId);
                    if (company) {
                        selectCompany(company);
                    }
                });
            });
            
            searchResults.style.display = 'block';
        }

        // Select a company from search results
        function selectCompany(company) {
            selected = company;
            if (searchInput) searchInput.value = company.name;
            if (confirmBtn) confirmBtn.disabled = false;
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
            if (!company) return;
            
            try {
                const response = await fetch('/api/update-company', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        company_id: company.id
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to update company');
                }
                
                // Update the display
                updateCompanyDisplay(company.name, company.email);
                showToast(`Company updated to ${company.name}`, 'success');
                
                // Hide search box and show info bar
                if (searchBox) searchBox.style.display = 'none';
                if (bar) bar.style.display = 'block';
                
                // Reset search
                resetSearch();
                
            } catch (error) {
                console.error('Error updating company:', error);
                showToast('Failed to update company. Please try again.', 'error');
            }
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
        changeBtn?.addEventListener('click', async () => {
            await loadCompanies();
            if (bar) bar.style.display = 'none';
            if (searchBox) searchBox.style.display = 'block';
            if (searchResults) searchResults.style.display = 'block';
            if (searchInput) searchInput.focus();
        });

        cancelBtn?.addEventListener('click', () => {
            if (bar) bar.style.display = 'block';
            if (searchBox) searchBox.style.display = 'none';
            resetSearch();
        });

        confirmBtn?.addEventListener('click', () => {
            if (!selected) return;
            updateCompany(selected);
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
