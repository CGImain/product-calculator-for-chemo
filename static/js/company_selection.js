document.addEventListener('DOMContentLoaded', async function() {
    const searchInput = document.getElementById('companyInput');
    const searchResults = document.getElementById('searchResults');
    let companiesData = [];

    try {
        const response = await fetch('/get_companies');
        companiesData = await response.json();
    } catch (error) {
        console.error('Error loading companies:', error);
    }

    // Handle search input
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        if (!searchTerm) {
            searchResults.innerHTML = '';
            return;
        }

        // Split search term into individual characters and create regex pattern
        const searchPattern = searchTerm.split('').join('.*');
        const regex = new RegExp(searchPattern, 'i');

        // Filter companies using regex pattern
        const filteredCompanies = companiesData.filter(company => 
            regex.test(company.name)
        );

        // Sort results by how early the search term appears in the company name
        filteredCompanies.sort((a, b) => {
            const posA = a.name.toLowerCase().indexOf(searchTerm.toLowerCase());
            const posB = b.name.toLowerCase().indexOf(searchTerm.toLowerCase());
            return posA - posB;
        });

        // Update search results
        searchResults.innerHTML = filteredCompanies.map(company => 
            `<div class="search-item" data-id="${company.id}" data-name="${company.name}" data-email="${company.email}">
                ${company.name}<br>
                <small class="text-muted">${company.email}</small>
            </div>`
        ).join('');

        // Add click handlers to search results
        searchResults.querySelectorAll('.search-item').forEach(item => {
            item.addEventListener('click', function() {
                const companyId = this.dataset.id;
                const companyName = this.dataset.name;
                const companyEmail = this.dataset.email;
                
                // Save company info
                localStorage.setItem('selectedCompany', JSON.stringify({
                    id: companyId,
                    name: companyName,
                    email: companyEmail
                }));

                // Set hidden form field
                document.getElementById('selectedCompanyId').value = companyId;
                
                // Hide search results
                searchResults.innerHTML = '';
                
                // Submit the form
                document.getElementById('companyForm').submit();
            });
        });
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
