// Function to handle company info from URL parameters
function handleCompanyFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const companyName = urlParams.get('company_name');
    const companyEmail = urlParams.get('company_email');
    const companyId = urlParams.get('company_id');
    
    if (companyName && companyEmail) {
        const companyInfo = {
            name: decodeURIComponent(companyName),
            email: decodeURIComponent(companyEmail),
            id: companyId || ''
        };
        
        // Save to localStorage for persistence
        localStorage.setItem('selectedCompany', JSON.stringify(companyInfo));
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const select = $('#productTypeSelect');
    
    // First check URL for company info
    handleCompanyFromUrl();
    
    // Then check localStorage
    const savedCompany = localStorage.getItem('selectedCompany');
    if (!savedCompany) {
        // Redirect to company selection if no company selected
        window.location.href = '/company_selection';
        return;
    }

    // Initialize Select2
    select.select2({
        theme: 'bootstrap-5',
        width: '100%'
    });

    // Handle form submission
    document.getElementById('productForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const productType = select.val();
        
        if (!productType) {
            alert('Please select a product type');
            return;
        }

        // Get company info from localStorage
        const companyInfo = JSON.parse(localStorage.getItem('selectedCompany') || '{}');
        
        // Create URL with company info
        let url = `/${productType}`;
        const params = new URLSearchParams();
        
        if (companyInfo.id) params.append('company_id', companyInfo.id);
        if (companyInfo.name) params.append('company_name', encodeURIComponent(companyInfo.name));
        if (companyInfo.email) params.append('company_email', encodeURIComponent(companyInfo.email));
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        // Navigate to the selected product page with company info
        window.location.href = url;
    });
});
