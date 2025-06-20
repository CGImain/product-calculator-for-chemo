// Main JavaScript file that will be loaded on all pages
console.log('Main JavaScript loaded');

// You can add common JavaScript functionality here
// For example, initialize tooltips, modals, etc.
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
});
