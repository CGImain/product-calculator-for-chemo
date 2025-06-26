document.addEventListener('DOMContentLoaded', function() {
    const select = $('#productTypeSelect');
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

        // Submit the form
        this.submit();
    });
});
