// Get cart container reference at the top
const cartContainer = document.getElementById('cart-container');

// Helper function to round numbers to 2 decimal places
function round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

// Function to calculate item prices based on type
function calculateItemPrices(item) {
    // This function is no longer needed as calculations are done server-side
    // We'll keep it for backward compatibility
    if (!item.calculations) {
        if (item.type === 'mpack') {
            const price = parseFloat(item.unit_price) || 0;
            const quantity = parseInt(item.quantity) || 1;
            const discountPercent = parseFloat(item.discount_percent) || 0;
            const gstPercent = parseFloat(item.gst_percent) || 18;
            
            const discountAmount = (price * quantity * discountPercent / 100);
            const priceAfterDiscount = (price * quantity) - discountAmount;
            const gstAmount = (priceAfterDiscount * gstPercent / 100);
            const finalTotal = priceAfterDiscount + gstAmount;
            
            item.calculations = {
                unitPrice: parseFloat(price.toFixed(2)),
                quantity: quantity,
                discountPercent: discountPercent,
                discountAmount: parseFloat(discountAmount.toFixed(2)),
                priceAfterDiscount: parseFloat(priceAfterDiscount.toFixed(2)),
                gstPercent: gstPercent,
                gstAmount: round(gstAmount, 2),
                finalTotal: round(finalTotal, 2)
            };
        } else if (item.type === 'blanket') {
            const basePrice = parseFloat(item.base_price) || 0;
            const barPrice = parseFloat(item.bar_price) || 0;
            const quantity = parseInt(item.quantity) || 1;
            const discountPercent = parseFloat(item.discount_percent) || 0;
            const gstPercent = parseFloat(item.gst_percent) || 18;
            
            // Calculate unit price (base + bar) - matches backend logic
            const unitPrice = basePrice + barPrice;
            
            // Calculate subtotal (unit_price * quantity) - matches backend logic
            const subtotal = unitPrice * quantity;
            
            // Calculate discount amount - matches backend logic
            const discountAmount = subtotal * (discountPercent / 100);
            
            // Calculate discounted subtotal - matches backend logic
            const discountedSubtotal = subtotal - discountAmount;
            
            // Calculate GST on discounted subtotal - matches backend logic
            const gstAmount = (discountedSubtotal * gstPercent) / 100;
            
            // Calculate final total - matches backend logic
            const finalTotal = discountedSubtotal + gstAmount;
            
            item.calculations = {
                unit_price: round(unitPrice, 2),
                quantity: quantity,
                subtotal: round(subtotal, 2),
                discount_percent: discountPercent,
                discount_amount: round(discountAmount, 2),
                discounted_subtotal: round(discountedSubtotal, 2),
                gst_percent: gstPercent,
                gst_amount: round(gstAmount, 2),
                final_total: round(finalTotal, 2)
            };
        }
    }
    return item.calculations;
}

// Function to add item to cart
function addToCart(item, event) {
    item = calculateItemPrices(item);
    const addToCartBtn = event.target;
    const originalText = addToCartBtn.innerHTML;
    
    addToCartBtn.disabled = true;
    addToCartBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';

    fetch('/add_to_cart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(item)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            updateCartCount();
            showToast('Success', 'Item added to cart', 'success');
        } else {
            showToast('Error', data.message || 'Failed to add item to cart', 'error');
        }
    })
    .catch(error => {
        console.error('Error adding to cart:', error);
        showToast('Error', 'An error occurred while adding to cart', 'error');
    })
    .finally(() => {
        addToCartBtn.disabled = false;
        addToCartBtn.innerHTML = originalText;
    });
}

// Function to get CSRF token from cookies
function getCSRFToken() {
    const name = 'csrf_token=';
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) === 0) {
            return c.substring(name.length, c.length);
        }
    }
    return '';
}

// Function to get cart from localStorage
function getCart() {
    try {
        const cartData = localStorage.getItem('cart');
        if (!cartData) return { products: [] };
        
        const parsed = JSON.parse(cartData);
        return Array.isArray(parsed) ? { products: parsed } : parsed;
    } catch (error) {
        console.error('Error getting cart from localStorage:', error);
        return { products: [] };
    }
}

// Function to update cart empty state
function updateCartEmptyState() {
    const cartItems = document.getElementById('cartItems');
    const emptyCart = document.getElementById('emptyCart');
    const cartFooter = document.querySelector('.cart-footer');
    
    if (!cartItems) return;
    
    const hasItems = document.querySelectorAll('.cart-item').length > 0;
    
    if (hasItems) {
        cartItems.style.display = 'flex';
        if (emptyCart) emptyCart.style.display = 'none';
        if (cartFooter) cartFooter.style.display = 'flex';
    } else {
        cartItems.style.display = 'flex';
        if (emptyCart) emptyCart.style.display = 'block';
        if (cartFooter) cartFooter.style.display = 'none';
    }
}

// Function to update cart count in the UI
function updateCartCount() {
    fetch('/get_cart_count')
        .then(response => response.json())
        .then(data => {
            const cartCount = document.getElementById('cart-count');
            if (cartCount) {
                cartCount.textContent = data.count;
                cartCount.style.display = data.count > 0 ? 'inline' : 'none';
            }
        })
        .catch(error => console.error('Error updating cart count:', error));
}

// Function to show toast notifications
function showToast(title, message, type = 'info') {
    // Remove any existing toasts first
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    });

    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.position = 'fixed';
        toastContainer.style.top = '20px';
        toastContainer.style.right = '20px';
        toastContainer.style.zIndex = '1100';
        document.body.appendChild(toastContainer);
    }

    // Create toast with unique ID based on content to prevent duplicates
    const toastId = `toast-${Date.now()}`;
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast show align-items-center text-white bg-${type} border-0`;
    toast.role = 'alert';
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.style.marginBottom = '10px';
    
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

    // Auto remove after 5 seconds
    setTimeout(() => {
        const existingToast = document.getElementById(toastId);
        if (existingToast) {
            existingToast.classList.remove('show');
            setTimeout(() => {
                if (existingToast && existingToast.parentNode) {
                    existingToast.parentNode.removeChild(existingToast);
                }
            }, 300);
        }
    }, 5000);
}

// Update company display in the cart
function updateCompanyDisplay(name, email) {
    const companyNameEl = document.getElementById('companyName');
    const companyInfoEl = document.getElementById('companyInfo');
    
    if (name && name !== 'undefined' && name !== 'Your Company') {
        companyNameEl.textContent = name;
    } else {
        companyNameEl.textContent = 'Your Company';
    }
    
    if (email && email !== 'undefined' && email !== 'email@example.com') {
        companyInfoEl.innerHTML = `<a href="mailto:${email}" id="companyEmail" class="text-muted mb-0" style="text-decoration: none;">${email}</a>`;
    } else {
        companyInfoEl.innerHTML = '<p class="text-muted mb-0" id="companyEmail">No email provided</p>';
    }
}

// Initialize company info from URL parameters and storage
function initCompanyInfo() {
    try {
        // First check URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const companyName = urlParams.get('company_name');
        const companyEmail = urlParams.get('company_email');
        const companyId = urlParams.get('company_id');

        if (companyName && companyEmail) {
            // We have company info in URL
            const companyInfo = {
                name: decodeURIComponent(companyName),
                email: decodeURIComponent(companyEmail),
                id: companyId || ''
            };

            // Save to both localStorage and sessionStorage for consistency
            const companyString = JSON.stringify(companyInfo);
            localStorage.setItem('selectedCompany', companyString);
            sessionStorage.setItem('selectedCompany', companyString);

            updateCompanyDisplay(companyInfo.name, companyInfo.email);
            updateNavCompanyDisplay(companyInfo.name);
            return;
        }

        // If no URL params, check localStorage
        const storedCompany = localStorage.getItem('selectedCompany');
        if (storedCompany) {
            const company = JSON.parse(storedCompany);
            updateCompanyDisplay(company.name, company.email);
            updateNavCompanyDisplay(company.name);

            // Ensure it's also in sessionStorage
            sessionStorage.setItem('selectedCompany', storedCompany);
            return;
        }

        // Finally, check sessionStorage
        const sessionCompany = sessionStorage.getItem('selectedCompany');
        if (sessionCompany) {
            const company = JSON.parse(sessionCompany);
            updateCompanyDisplay(company.name, company.email);
            updateNavCompanyDisplay(company.name);

            // Save to localStorage for persistence
            localStorage.setItem('selectedCompany', sessionCompany);
        }
    } catch (e) {
        console.error('Error initializing company info:', e);
    }
}

// Update company display in the navigation
function updateNavCompanyDisplay(companyName) {
    const companyDisplay = document.getElementById('companyNameDisplay');
    if (companyDisplay && companyName) {
        companyDisplay.textContent = companyName;
    }
}

// Function to normalize cart data structure
function normalizeCartData(cartData) {
    console.log('Normalizing cart data...');
    
    if (!cartData) {
        console.log('No cart data, returning empty cart');
        return { products: [] };
    }
    
    try {
        // If cartData is already an object with products array, return as is
        if (cartData.products && Array.isArray(cartData.products)) {
            console.log('Cart data already has products array');
            return cartData;
        }
        
        // If cartData is an array, convert to object with products array
        if (Array.isArray(cartData)) {
            console.log('Converting array cart to object with products array');
            return { products: cartData };
        }
        
        // If cartData is an object but doesn't have products array, create one
        if (typeof cartData === 'object' && cartData !== null) {
            console.log('Converting object cart to standard format');
            return { 
                products: Object.values(cartData).filter(item => item !== null && typeof item === 'object')
            };
        }
        
        // If we get here, the format is unexpected
        console.warn('Unexpected cart format, initializing empty cart');
        return { products: [] };
        
    } catch (error) {
        console.error('Error normalizing cart data:', error);
        return { products: [] };
    }
}

// Initialize all cart handlers
function initializeCart() {
    console.log('Initializing cart...');
    
    // Load and normalize cart data
    try {
        const cartData = localStorage.getItem('cart');
        const parsedCart = cartData ? JSON.parse(cartData) : { products: [] };
        const normalizedCart = normalizeCartData(parsedCart);
        
        // Save normalized cart back to localStorage
        if (JSON.stringify(parsedCart) !== JSON.stringify(normalizedCart)) {
            console.log('Saving normalized cart data');
            localStorage.setItem('cart', JSON.stringify(normalizedCart));
        }
    } catch (error) {
        console.error('Error initializing cart data:', error);
        localStorage.setItem('cart', JSON.stringify({ products: [] }));
    }
    
    // Store original quantities when page loads
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.setAttribute('data-original-quantity', input.value);
    });
    
    // Set up quantity change handlers
    console.log('Setting up quantity handlers...');
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.addEventListener('change', handleQuantityInputChange);
        input.addEventListener('keydown', handleQuantityKeyDown);
    });
    
    // Set up discount update handlers
    document.querySelectorAll('.update-discount-btn').forEach(button => {
        button.addEventListener('click', handleDiscountUpdate);
    });
    
    // Set up discount input handlers
    document.querySelectorAll('.discount-input').forEach(input => {
        input.addEventListener('keydown', handleDiscountKeyDown);
    });
    
    console.log('Setting up remove handlers...');
    setupRemoveHandlers();
    
    // Set up change item buttons
    console.log('Setting up change item handlers...');
    document.querySelectorAll('.change-item-btn').forEach(button => {
        button.addEventListener('click', handleChangeItem);
    });
    
    // Initialize calculations
    console.log('Initializing cart calculations...');
    initializeCartCalculations();
    
    // Update UI
    console.log('Updating cart UI...');
    updateCartCount();
    updateCartTotals();
    
    // Check if we need to show the empty cart message
    const cartItems = document.querySelectorAll('.cart-item');
    const emptyCartDiv = document.getElementById('emptyCart');
    const cartItemsDiv = document.getElementById('cartItems');
    
    console.log(`Found ${cartItems.length} cart items`);
    
    if (cartItems.length === 0) {
        console.log('No cart items, showing empty cart message');
        if (emptyCartDiv) emptyCartDiv.style.display = 'block';
        if (cartItemsDiv) cartItemsDiv.style.display = 'flex';
    } else {
        console.log('Cart has items, showing cart contents');
        if (emptyCartDiv) emptyCartDiv.style.display = 'none';
        if (cartItemsDiv) cartItemsDiv.style.display = 'block';
    }
}

// Make createProductTypeModal available globally
window.createProductTypeModal = function() {
    const modalHTML = `
        <div class="modal fade" id="productTypeModal" tabindex="-1" aria-labelledby="productTypeModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="productTypeModalLabel">Select Product Type</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body text-center">
                        <div class="row g-3">
                            <div class="col-6">
                                <button type="button" class="btn btn-outline-primary w-100 py-4" id="selectBlankets">
                                    <i class="fas fa-blanket fa-2x mb-2 d-block"></i>
                                    Blankets
                                </button>
                            </div>
                            <div class="col-6">
                                <button type="button" class="btn btn-outline-success w-100 py-4" id="selectMpacks">
                                    <i class="fas fa-box fa-2x mb-2 d-block"></i>
                                    MPacks
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    
    // Add modal to the body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Initialize the modal
    const modal = new bootstrap.Modal(document.getElementById('productTypeModal'));
    
    // Get company ID once
    const companyId = sessionStorage.getItem('companyId') || 
                     new URLSearchParams(window.location.search).get('company_id');
    
    // Add event listeners to the buttons
    document.getElementById('selectBlankets').addEventListener('click', function() {
        if (companyId) {
            window.location.href = `/blankets?company_id=${companyId}`;
        } else {
            window.location.href = '/blankets';
        }
    });
    
    document.getElementById('selectMpacks').addEventListener('click', function() {
        if (companyId) {
            window.location.href = `/mpacks?company_id=${companyId}`;
        } else {
            window.location.href = '/mpacks';
        }
    });
    
    return modal;
}

// Function to handle continue shopping
function handleContinueShopping() {
    try {
        // Get company info from localStorage
        const companyInfo = JSON.parse(localStorage.getItem('selectedCompany') || '{}');
        
        // Create URL with company info
        let url = '/product-selection';
        const params = new URLSearchParams();
        
        if (companyInfo.id) params.append('company_id', companyInfo.id);
        if (companyInfo.name) params.append('company_name', encodeURIComponent(companyInfo.name));
        if (companyInfo.email) params.append('company_email', encodeURIComponent(companyInfo.email));
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        // Navigate to the product selection page with company info
        window.location.href = url;
    } catch (error) {
        console.error('Error showing product type modal:', error);
        // Fallback in case modal fails to initialize
        let companyId = '';
        try {
            // Try to get company ID from the page data
            const companyInfoElement = document.querySelector('[data-company-id]');
            if (companyInfoElement) {
                companyId = companyInfoElement.getAttribute('data-company-id');
            } else {
                // Fallback to URL parameters or session storage
                companyId = new URLSearchParams(window.location.search).get('company_id') || 
                           sessionStorage.getItem('companyId') ||
                           (() => {
                               const storedCompany = sessionStorage.getItem('selected_company');
                               return storedCompany ? JSON.parse(storedCompany).id : '';
                           })();
            }
            
            // Build the URL with company ID if available
            const url = new URL('/product-selection', window.location.origin);
            if (companyId) {
                url.searchParams.append('company_id', companyId);
            }
            
            window.location.href = url.toString();
            
        } catch (e) {
            console.error('Error in continue shopping fallback:', e);
            window.location.href = '/product-selection';
        }
    }
}

// Helper to remove or merge duplicate MPack items in the cart
function checkForDuplicateMpacks() {
    try {
        const mpackItems = document.querySelectorAll('.cart-item[data-type="mpack"]');
        const seen = new Map();

        mpackItems.forEach(item => {
            // Create a more specific key that includes both ID and name to prevent incorrect merging
            const itemId = item.dataset.id || '';
            const itemName = item.dataset.name || item.querySelector('.item-name')?.textContent?.trim() || '';
            const key = `${itemId}-${itemName}`; // Combine ID and name for uniqueness
            
            if (!key) return; // Skip if no identifiable key

            if (seen.has(key)) {
                // Duplicate found â€“ only merge if it's truly the same product with same attributes
                const existing = seen.get(key);
                const existingAttrs = existing.dataset;
                const newAttrs = item.dataset;
                
                // Check if all data attributes match before considering them duplicates
                let isExactMatch = true;
                for (const attr in existingAttrs) {
                    if (existingAttrs[attr] !== newAttrs[attr]) {
                        isExactMatch = false;
                        break;
                    }
                }
                
                if (isExactMatch) {
                    const qtyInputExisting = existing.querySelector('.quantity-input');
                    const qtyInputDuplicate = item.querySelector('.quantity-input');

                    if (qtyInputExisting && qtyInputDuplicate) {
                        const totalQty = (parseInt(qtyInputExisting.value) || 1) + (parseInt(qtyInputDuplicate.value) || 1);
                        qtyInputExisting.value = totalQty;
                        existing.setAttribute('data-quantity', totalQty);
                    }

                    // Remove the duplicate row from DOM
                    item.remove();
                }
            } else {
                seen.set(key, item);
            }
        });

        // After checking for duplicates, recalculate totals
        updateCartTotals();
    } catch (err) {
        console.error('Error checking for duplicate MPacks:', err);
    }
}

// Helper to remove or merge duplicate Blanket items in the cart
function checkForDuplicateBlankets() {
    try {
        const blanketItems = document.querySelectorAll('.cart-item[data-type="blanket"]');
        const seen = new Map();

        blanketItems.forEach(item => {
            // Create a unique key based on all relevant attributes
            const itemId = item.dataset.id || '';
            const itemName = item.dataset.name || item.querySelector('.item-name')?.textContent?.trim() || '';
            const size = item.dataset.size || '';
            const thickness = item.dataset.thickness || '';
            const barType = item.dataset.barType || '';
            
            // Create a composite key using all relevant attributes
            const key = `${itemId}-${itemName}-${size}-${thickness}-${barType}`.toLowerCase();
            
            if (!key) return; // Skip if no identifiable key

            if (seen.has(key)) {
                // Duplicate found â€“ only merge if it's truly the same product with same attributes
                const existing = seen.get(key);
                const existingAttrs = existing.dataset;
                const newAttrs = item.dataset;
                
                // Check if all data attributes match before considering them duplicates
                let isExactMatch = true;
                for (const attr in existingAttrs) {
                    if (existingAttrs[attr] !== newAttrs[attr]) {
                        isExactMatch = false;
                        break;
                    }
                }
                
                if (isExactMatch) {
                    const qtyInputExisting = existing.querySelector('.quantity-input');
                    const qtyInputDuplicate = item.querySelector('.quantity-input');

                    if (qtyInputExisting && qtyInputDuplicate) {
                        const totalQty = (parseInt(qtyInputExisting.value) || 1) + (parseInt(qtyInputDuplicate.value) || 1);
                        qtyInputExisting.value = totalQty;
                        existing.setAttribute('data-quantity', totalQty);
                    }

                    // Remove the duplicate row from DOM
                    item.remove();
                }
            } else {
                seen.set(key, item);
            }
        });

        // After checking for duplicates, recalculate totals
        updateCartTotals();
    } catch (err) {
        console.error('Error checking for duplicate Blankets:', err);
    }
}

// Function to toggle quotation section
function toggleQuotationSection() {
    const cartItems = document.querySelectorAll('.cart-item');
    const quotationSection = document.getElementById('quotationSection');
    if (quotationSection) {
        quotationSection.style.display = cartItems.length > 0 ? 'block' : 'none';
    }
}

// Function to handle clearing the cart
function handleClearCart(event) {
    // Update empty state after clearing cart
    updateCartEmptyState();
    if (event) event.preventDefault();
    
    if (!confirm('Are you sure you want to clear your cart? This action cannot be undone.')) {
        return false;
    }
    
    const csrfToken = getCSRFToken();
    const clearButton = event.target.closest('button');
    const originalHtml = clearButton ? clearButton.innerHTML : '';
    
    // Show loading state
    if (clearButton) {
        clearButton.disabled = true;
        clearButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Clearing...';
    }
    
    fetch('/clear_cart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw err; });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Remove all cart items from the DOM
            const cartItemsContainer = document.getElementById('cartItems');
            if (cartItemsContainer) {
                // Remove all child elements except the first one (which contains the empty cart message)
                while (cartItemsContainer.firstChild) {
                    cartItemsContainer.removeChild(cartItemsContainer.firstChild);
                }
                
                // Show empty cart message
                const emptyCart = document.getElementById('emptyCart');
                if (emptyCart) {
                    emptyCart.style.display = 'block';
                }
                
                // Hide the cart items container
                cartItemsContainer.style.display = 'flex';
            }
            
            // Update cart count
            updateCartCount();
            
            // Reset cart totals
            const cartTotals = document.querySelectorAll('.cart-summary, .cart-total, .checkout-section');
            cartTotals.forEach(el => el.style.display = 'none');
            
            // Show success message
            showToast('Success', 'Your cart has been cleared', 'success');
            
            // Trigger an event that other components might be listening for
            document.dispatchEvent(new Event('cartCleared'));
        } else {
            throw new Error(data.error || 'Failed to clear cart');
        }
    })
    .catch(error => {
        console.error('Error clearing cart:', error);
        showToast('Error', error.message || 'An error occurred while clearing the cart', 'error');
    })
    .finally(() => {
        // Restore button state
        if (clearButton) {
            clearButton.disabled = false;
            clearButton.innerHTML = originalHtml;
        }
    });
    
    return false;
}

// Function to sync cart from server to localStorage
function syncCartFromServer() {
    try {
        // Get the cart data from the server-rendered template
        const serverCartData = document.getElementById('cartData');
        if (serverCartData && serverCartData.textContent) {
            const serverCart = JSON.parse(serverCartData.textContent);
            if (serverCart && Array.isArray(serverCart.products)) {
                // Update localStorage with server cart data
                localStorage.setItem('cart', JSON.stringify(serverCart));
                console.log('Synced cart from server to localStorage');
                return true;
            }
        }
    } catch (error) {
        console.error('Error syncing cart from server:', error);
    }
    return false;
}

// Initialize cart when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded, initializing cart...');
    
    // Initialize company info first
    initCompanyInfo();
    
    try {
        // Get server-rendered cart data if available
        const serverCartData = document.getElementById('serverCartData');
        if (serverCartData) {
            try {
                const serverCart = JSON.parse(serverCartData.textContent);
                if (Array.isArray(serverCart) && serverCart.length > 0) {
                    console.log('Found server-rendered cart with', serverCart.length, 'items');
                    // Update localStorage with server cart data
                    const currentCart = getCart();
                    currentCart.products = serverCart;
                    localStorage.setItem('cart', JSON.stringify(currentCart));
                }
            } catch (e) {
                console.error('Error parsing server cart data:', e);
            }
        }
        
        // Sync cart from server to localStorage
        syncCartFromServer();
        
        // Initial empty state check
        updateCartEmptyState();
        
        // Initialize cart
        initializeCart();
        
        // Set up continue shopping buttons
        const continueShoppingBtn = document.getElementById('continueShoppingBtn');
        const continueShoppingBtnBottom = document.getElementById('continueShoppingBtnBottom');
        
        if (continueShoppingBtn) {
            continueShoppingBtn.addEventListener('click', handleContinueShopping);
        }
        
        if (continueShoppingBtnBottom) {
            continueShoppingBtnBottom.addEventListener('click', handleContinueShopping);
        }
        
        // Re-initialize company info after cart is loaded to ensure it's displayed
        setTimeout(initCompanyInfo, 500);
        
        // Initialize cart calculations
        initializeCartCalculations();
        
        // Update cart totals
        console.log('Updating cart totals...');
        updateCartTotals();
        
        // Check for duplicate items
        console.log('Checking for duplicate MPacks...');
        checkForDuplicateMpacks();
        
        console.log('Checking for duplicate Blankets...');
        checkForDuplicateBlankets();
        
        // Toggle quotation section based on cart items
        toggleQuotationSection();
        
        // Listen for cart updates from other tabs
        window.addEventListener('storage', function(event) {
            if (event.key === 'cart') {
                try {
                    window.location.reload();
                } catch (e) {
                    console.error('Error handling cart update:', e);
                }
            }
        });
        
        // Add a small delay to ensure all elements are properly initialized
        setTimeout(() => {
            console.log('Cart initialization complete');
            // Force a recalculation of totals after a short delay
            updateCartTotals();
        }, 100);
        
        // Set up clear cart button
        const clearCartBtn = document.getElementById('clearCartBtn');
        if (clearCartBtn) {
            clearCartBtn.addEventListener('click', handleClearCart);
        }
    } catch (error) {
        console.error('Error initializing cart:', error);
    }
    
    // Set up event delegation for quantity buttons and discount updates
    document.addEventListener('click', function(event) {
        // Handle decrease quantity button click
        if (event.target.closest('.decrease-quantity')) {
            const input = event.target.closest('.quantity-wrapper').querySelector('.quantity-input');
            if (input) {
                let value = parseInt(input.value) || 1;
                if (value > 1) {
                    input.value = value - 1;
                    handleQuantityChange({ target: input });
                }
            }
        }
        
        // Handle increase quantity button click
        if (event.target.closest('.increase-quantity')) {
            const input = event.target.closest('.quantity-wrapper').querySelector('.quantity-input');
            if (input) {
                let value = parseInt(input.value) || 1;
                input.value = value + 1;
                handleQuantityChange({ target: input });
            }
        }
        
        // Handle discount update button
        if (event.target.closest('.update-discount-btn')) {
            handleDiscountUpdate(event);
        }
    });
    
    // Set up input change handler for direct input
    document.addEventListener('change', function(event) {
        if (event.target.classList.contains('quantity-input')) {
            handleQuantityChange(event);
        }
    });
    
    // Handle change item button clicks using event delegation
    document.addEventListener('click', function(event) {
        if (event.target.closest('.change-item-btn')) {
            handleChangeItem(event);
        }
    });
    
    // Handle discount input on Enter key
    document.addEventListener('keydown', function(event) {
        if (event.target.classList.contains('discount-input') && event.key === 'Enter') {
            handleDiscountKeyDown(event);
        }
    });
    
    // Set up remove handlers
    setupRemoveHandlers();
    
    // Initialize cart calculations
    initializeCartCalculations();
    
    // Check for duplicate MPacks
    checkForDuplicateMpacks();
    
    // Set up clear cart button
    const clearCartBtn = document.getElementById('clearCartBtn');
    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('Are you sure you want to clear your cart? This cannot be undone.')) {
                handleClearCart(e);
            }
        });
    }
    
    // Set up checkout button
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = '/checkout';
        });
    }
    
    // Set up footer continue shopping button
    const continueShoppingFooter = document.getElementById('continueShoppingBtnBottom');
    if (continueShoppingFooter) {
        continueShoppingFooter.addEventListener('click', function(e) {
            e.preventDefault();
            handleContinueShopping();
        });
    }
    
    // Set up footer clear cart button
    const clearCartFooter = document.getElementById('clearCartBtnFooter');
    if (clearCartFooter) {
        clearCartFooter.addEventListener('click', handleClearCart);
    }
    
    // Set up change company button
    const changeCompanyBtn = document.getElementById('changeCompanyBtn');
    if (changeCompanyBtn) {
        changeCompanyBtn.addEventListener('click', function() {
            window.location.href = '/select-company';
        });
    }
    
    // Set up mutation observer for cart changes
    if (cartContainer) {
        // Show the cart initially
        cartContainer.style.visibility = 'visible';
        
        const observer = new MutationObserver(function() {
            checkForDuplicateMpacks();
            checkForDuplicateBlankets();
            updateCartTotals(); // Ensure totals are updated on any cart changes
        });
        
        observer.observe(cartContainer, { 
            childList: true, 
            subtree: true,
            attributes: true,
            characterData: true
        });
        
        // Show cart after a short delay if mutation observer doesn't trigger
        setTimeout(() => {
            if (cartContainer.style.visibility !== 'visible') {
                cartContainer.style.visibility = 'visible';
            }
        }, 500);
    }
    
    // Initialize the cart
    initializeCart();
    
    // Check for duplicate items on initial load
    checkForDuplicateMpacks();
    checkForDuplicateBlankets();
    
    console.log('Cart initialization complete');
});

// Initialize cart calculations
function initializeCartCalculations() {
    const cartItems = document.querySelectorAll('.cart-item');
    cartItems.forEach(item => {
        // Only calculate prices, no quantity handlers
        if (item.dataset.type === 'mpack') {
            calculateMPackPrices(item);
        } else if (item.dataset.type === 'blanket') {
            calculateBlanketPrices(item);
        }
    });
}

// Function to calculate MPack prices
function calculateMPackPrices(item) {
    const unitPrice = parseFloat(item.getAttribute('data-unit-price') || 0);
    const quantity = parseInt(item.querySelector('.quantity-input')?.value || 1);
    const discountPercent = parseFloat(item.getAttribute('data-discount-percent') || 0);
    const gstPercent = parseFloat(item.getAttribute('data-gst-percent') || 12);
    
    // Calculate prices
    const subtotal = unitPrice * quantity;
    const discountAmount = subtotal * (discountPercent / 100);
    const discountedSubtotal = subtotal - discountAmount;
    const gstAmount = (discountedSubtotal * gstPercent) / 100;
    const total = discountedSubtotal + gstAmount;
    
    return {
        subtotal: round(subtotal, 2),
        discountAmount: round(discountAmount, 2),
        discountedSubtotal: round(discountedSubtotal, 2),
        gstAmount: round(gstAmount, 2),
        total: round(total, 2)
    };
}

// Function to calculate blanket prices
function calculateBlanketPrices(item) {
    // Get base price and bar price from data attributes
    const basePrice = parseFloat(item.getAttribute('data-base-price') || 0);
    const barPrice = parseFloat(item.getAttribute('data-bar-price') || 0);
    const quantity = parseInt(item.querySelector('.quantity-input')?.value || 1);
    const discountPercent = parseFloat(item.querySelector('.discount-input')?.value || 0);
    const gstPercent = parseFloat(item.getAttribute('data-gst-percent') || 18);
    
    console.log('Calculating blanket prices with:', {
        basePrice, barPrice, quantity, discountPercent, gstPercent
    });
    
    // Calculate unit price (base + bar)
    const unitPrice = basePrice + barPrice;
    
    // Calculate subtotal as (base + bar) * quantity for display
    const displaySubtotal = (basePrice + barPrice) * quantity;
    
    // Calculate discount amount on the subtotal
    const discountAmount = displaySubtotal * (discountPercent / 100);
    
    // Calculate discounted subtotal
    const discountedSubtotal = displaySubtotal - discountAmount;
    
    // Calculate GST on discounted subtotal
    const gstAmount = (discountedSubtotal * gstPercent) / 100;
    
    // Calculate final total
    const finalTotal = discountedSubtotal + gstAmount;
    
    console.log('Blanket calculation (updated):', {
        basePrice, barPrice, unitPrice, quantity, discountPercent,
        displaySubtotal: round(displaySubtotal, 2),
        discountAmount: round(discountAmount, 2),
        discountedSubtotal: round(discountedSubtotal, 2),
        gstAmount: round(gstAmount, 2),
        finalTotal: round(finalTotal, 2)
    });
    
    // Update the displayed subtotal in the item row
    const subtotalElement = item.querySelector('.subtotal-value');
    if (subtotalElement) {
        subtotalElement.textContent = `₹${displaySubtotal.toFixed(2)}`;
    }
    
    return {
        unitPrice: round(unitPrice, 2),
        subtotal: round(displaySubtotal, 2),
        discountAmount: round(discountAmount, 2),
        totalBeforeGst: round(discountedSubtotal, 2),
        gstAmount: round(gstAmount, 2),
        total: round(finalTotal, 2)
    };
}

// Helper function to convert to meters (matching the one in blankets.js)
function convertToMeters(value, unit) {
    if (unit === 'mm') return value / 1000;
    if (unit === 'cm') return value / 100;
    if (unit === 'm') return value;
    if (unit === 'inch') return value * 0.0254;
    if (unit === 'feet') return value * 0.3048;
    if (unit === 'yard') return value * 0.9144;
    return value; // Default to meters if unit not recognized
}

function updateCartTotals() {
    try {
        let subtotal = 0;
        let totalDiscount = 0;
        let totalGst = 0;
        let total = 0;
        let totalItems = 0;
        
        const cartItems = document.querySelectorAll('.cart-item');
        const emptyCart = document.getElementById('emptyCart');
        const cartItemsContainer = document.getElementById('cartItems');
        
        // Show/hide empty cart message
        if (cartItems.length === 0) {
            if (emptyCart) emptyCart.style.display = 'block';
            if (cartItemsContainer) cartItemsContainer.style.display = 'flex';
            
            // Clear the cart summary
            const cartSummary = document.getElementById('cartSummary');
            if (cartSummary) {
                cartSummary.innerHTML = '';
            }
            return;
        } else {
            if (emptyCart) emptyCart.style.display = 'none';
            if (cartItemsContainer) cartItemsContainer.style.display = 'block';
        }
        
        // Calculate totals for all items
        cartItems.forEach(item => {
            try {
                const type = item.getAttribute('data-type');
                const quantity = parseInt(item.getAttribute('data-quantity') || '1');
                
                // Ensure quantity is at least 1
                const validQuantity = isNaN(quantity) || quantity < 1 ? 1 : quantity;
                
                if (type === 'mpack') {
                    // Get prices for mpack
                    const unitPrice = parseFloat(item.getAttribute('data-unit-price') || '0');
                    const discountPercent = parseFloat(item.getAttribute('data-discount-percent') || '0');
                    const gstPercent = parseFloat(item.getAttribute('data-gst-percent') || '12');
                    
                    // Calculate prices
                    const itemSubtotal = unitPrice * validQuantity;
                    const discountAmount = itemSubtotal * (discountPercent / 100);
                    const discountedSubtotal = itemSubtotal - discountAmount;
                    const gstAmount = (discountedSubtotal * gstPercent) / 100;
                    const itemTotal = discountedSubtotal + gstAmount;
                    
                    // Update running totals
                    subtotal += itemSubtotal // corrected to include MPack subtotal; // Use displaySubtotal for blanket items
                    totalDiscount += discountAmount;
                    totalGst += gstAmount;
                    total += itemTotal;
                    totalItems += validQuantity;
                    
                    // Update data attributes
                    item.setAttribute('data-quantity', validQuantity.toString());
                    
                    // Update item display
                    updateItemDisplay(item, {
                        finalTotal: itemTotal,
                        discountAmount: discountAmount,
                        gstAmount: gstAmount,
                        quantity: validQuantity,
                        unitPrice: unitPrice,
                        discountPercent: discountPercent,
                        gstPercent: gstPercent
                    });
                    
                } else if (type === 'blanket') {
                    // Get prices for blanket
                    const basePrice = parseFloat(item.getAttribute('data-base-price') || '0');
                    const barPrice = parseFloat(item.getAttribute('data-bar-price') || '0');
                    const discountPercent = parseFloat(item.getAttribute('data-discount-percent') || '0');
                    const gstPercent = parseFloat(item.getAttribute('data-gst-percent') || '18');
                    
                    // Calculate prices
                    const pricePerUnit = basePrice + barPrice;
                    const displaySubtotal = (basePrice + barPrice) * validQuantity;
                    const discountAmount = displaySubtotal * (discountPercent / 100);
                    const discountedSubtotal = displaySubtotal - discountAmount;
                    const gstAmount = (discountedSubtotal * gstPercent) / 100;
                    const itemTotal = discountedSubtotal + gstAmount;
                    
                    // Update running totals
                    subtotal += itemSubtotal // corrected to include MPack subtotal; // Use displaySubtotal for blanket items
                    totalDiscount += discountAmount;
                    totalGst += gstAmount;
                    total += itemTotal;
                    totalItems += validQuantity;
                    
                    // Update data attributes
                    item.setAttribute('data-quantity', validQuantity.toString());
                    
                    // Update item display
                    updateItemDisplay(item, {
                        finalTotal: itemTotal,
                        discountAmount: discountAmount,
                        gstAmount: gstAmount,
                        quantity: validQuantity,
                        basePrice: basePrice,
                        barPrice: barPrice,
                        discountPercent: discountPercent,
                        gstPercent: gstPercent
                    });
                }
            } catch (error) {
                console.error('Error calculating item totals:', error);
            }
        });
        
        // Update the cart summary
        const cartSummary = document.getElementById('cartSummary');
        if (cartSummary) {
            // Round all values to 2 decimal places
            subtotal = Math.round(subtotal * 100) / 100;
            totalDiscount = Math.round(totalDiscount * 100) / 100;
            totalGst = Math.round(totalGst * 100) / 100;
            total = Math.round(total * 100) / 100;
            
            cartSummary.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title mb-3">Order Summary</h5>
                        <div class="mb-2">
                            <div class="d-flex justify-content-between mb-1">
                                <span>Subtotal (${totalItems} ${totalItems === 1 ? 'item' : 'items'}):</span>
                                <span>₹${subtotal.toFixed(2)}</span>
                            </div>
                            ${totalDiscount > 0 ? `
                            <div class="d-flex justify-content-between mb-1 text-success">
                                <span>Discount:</span>
                                <span>-₹${totalDiscount.toFixed(2)}</span>
                            </div>` : ''}
                            <div class="d-flex justify-content-between mb-1 fw-medium">
                                <span>Total (Pre-GST):</span>
                                <span>₹${(subtotal - totalDiscount).toFixed(2)}</span>
                            </div>
                            <div class="d-flex justify-content-between mb-1">
                                <span>GST:</span>
                                <span>₹${totalGst.toFixed(2)}</span>
                            </div>
                        </div>
                        <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
                            <span class="fw-bold">Total:</span>
                            <span class="fw-bold fs-5">₹${total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>`;
        }
    } catch (error) {
        console.error('Error updating cart totals:', error);
    }
}

// Function to handle discount updates
function handleDiscountUpdate(event) {
    const button = event.target.closest('.update-discount-btn');
    if (!button) return;
    
    const index = button.getAttribute('data-index');
    if (index === null) {
        console.error('Could not find cart item index');
        return;
    }
    
    const cartItem = document.querySelector(`.cart-item[data-index="${index}"]`);
    if (!cartItem) {
        console.error('Cart item not found in DOM');
        return;
    }
    
    const discountInput = cartItem.querySelector('.discount-input');
    let discountPercent = parseFloat(discountInput.value);
    
    // Ensure the discount is between 0 and 100
    if (isNaN(discountPercent) || discountPercent < 0) {
        discountPercent = 0;
    } else if (discountPercent > 100) {
        discountPercent = 100;
    }
    
    // Update the input value in case it was out of bounds
    discountInput.value = discountPercent;
    
    // Update the cart item discount
    const itemId = cartItem.getAttribute('data-item-id');
    updateCartItemDiscount(index, discountPercent, itemId);
}

// Function to handle discount input keydown (Enter key)
function handleDiscountKeyDown(event) {
    if (event.key === 'Enter') {
        handleDiscountUpdate(event);
    }
}

// Function to update cart item discount
function updateCartItemDiscount(index, discountPercent, itemId) {
    updateCartEmptyState();
    const csrfToken = getCSRFToken();
    
    // Try to find the cart item in the DOM
    let cartItem = document.querySelector(`.cart-item[data-index="${index}"]`);
    
    // If not found, try to find any cart item with the index or item_id
    if (!cartItem) {
        const allCartItems = document.querySelectorAll('.cart-item');
        for (const item of allCartItems) {
            if (item.getAttribute('data-index') === index || item.getAttribute('data-item-id') === itemId) {
                cartItem = item;
                // Update the index in case we found by item_id
                if (itemId && !cartItem.getAttribute('data-index')) {
                    cartItem.setAttribute('data-index', index);
                }
                break;
            }
        }
    }
    
    // Get the update button before any async operations
    const updateButton = cartItem ? cartItem.querySelector('.update-discount-btn') : null;
    let originalHtml = '';
    
    // Store the original button state
    if (updateButton) {
        originalHtml = updateButton.innerHTML;
        updateButton.disabled = true;
        updateButton.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Updating...';
    }
    
    fetch('/update_cart_discount', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({
            index: parseInt(index),
            item_id: itemId,
            discount_percent: parseFloat(discountPercent)
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Update the UI with the new data from the server
            if (data.updated_item) {
                updateItemDisplay(cartItem, data.updated_item);
                updateCartTotals();
                showToast('Success', 'Discount updated', 'success');
            } else {
                updateCartTotals();
                showToast('Success', 'Discount updated', 'success');
            }
        } else {
            throw new Error(data.message || 'Failed to update discount');
        }
    })
    .catch(error => {
        console.error('Error updating discount:', error);
        showToast('Error', error.message || 'An error occurred while updating discount', 'error');
        // Don't re-throw here as it would prevent the finally block from running
        return Promise.reject(error);
    })
    .finally(() => {
        // Use a small timeout to ensure any pending UI updates are complete
        setTimeout(() => {
            try {
                // Check if the button still exists in the DOM
                if (updateButton && document.body.contains(updateButton)) {
                    updateButton.disabled = false;
                    updateButton.innerHTML = originalHtml || 'Update';
                } else if (updateButton && updateButton.parentNode) {
                    // If the button is not in the main document but still has a parent
                    // (might be in a removed but not yet garbage collected element)
                    updateButton.disabled = false;
                    updateButton.innerHTML = originalHtml || 'Update';
                }
                
                // Force a reflow to ensure the button state is updated
                if (updateButton) {
                    updateButton.offsetHeight;
                }
            } catch (e) {
                console.error('Error resetting update button:', e);
                
                // As a last resort, try to find the button again by its data attributes
                try {
                    const newButton = document.querySelector(`.update-discount-btn[data-item-id="${itemId}"]`);
                    if (newButton && document.body.contains(newButton)) {
                        newButton.disabled = false;
                        newButton.innerHTML = originalHtml || 'Update';
                    }
                } catch (innerError) {
                    console.error('Failed to recover button state:', innerError);
                }
            }
        }, 100);
    });
}

// Function to handle quantity changes
function handleQuantityChange(event) {
    const input = event.target;
    const index = input.getAttribute('data-index');
    
    if (index === null) {
        console.error('Could not find cart item index');
        return;
    }
    
    // Ensure the quantity is at least 1
    let newQuantity = parseInt(input.value);
    if (isNaN(newQuantity) || newQuantity < 1) {
        newQuantity = 1;
        input.value = 1;
    }

    // Update the cart item quantity
    updateCartItemQuantity(index, newQuantity);
}

// Function to update cart item quantity
function updateCartItemQuantity(index, newQuantity, type) {
    // Update empty state after quantity changes
    updateCartEmptyState();
    const csrfToken = getCSRFToken();
    
    // Try to find the cart item in the DOM
    let cartItem = document.querySelector(`.cart-item[data-index="${index}"]`);
    
    // If not found, try to find by type and index
    if (!cartItem && type) {
        cartItem = document.querySelector(`.cart-item[data-type="${type}"][data-index="${index}"]`);
    }
    
    // If still not found, try to find any cart item with the index
    if (!cartItem) {
        const allCartItems = document.querySelectorAll('.cart-item');
        for (const item of allCartItems) {
            if (item.getAttribute('data-index') === index) {
                cartItem = item;
                break;
            }
        }
    }
    
    if (!cartItem) {
        console.warn('Cart item not found in DOM, but will still update server-side');
        // Continue with the update even if we can't find the DOM element
    }
    
    const quantityInput = cartItem ? cartItem.querySelector('.quantity-input') : null;
    const originalValue = quantityInput ? quantityInput.value : '';
    
    if (quantityInput) {
        quantityInput.disabled = true;
    }
    
    // Get item ID from the cart item or use the index as fallback
    const itemId = cartItem ? cartItem.getAttribute('data-item-id') : null;
    
    fetch('/update_cart_quantity', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({
            index: parseInt(index),
            item_id: itemId,
            quantity: parseInt(newQuantity),
            type: cartItem ? cartItem.getAttribute('data-type') : null
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Update the UI with the new data from the server
            if (data.updated_item) {
                // Utilize helper to refresh all price-related fields including discount & GST
                const itemData = { ...data.updated_item };

                // Ensure type present for updateItemDisplay (fallback to DOM dataset)
                if (!itemData.type) {
                    itemData.type = cartItem ? cartItem.getAttribute('data-type') : '';
                }

                // Sync the quantity input first
                if (quantityInput) {
                    quantityInput.value = itemData.quantity || 1;
                }

                // Delegate DOM refresh to central utility
                updateItemDisplay(cartItem, itemData);
                
                // Recalculate totals
                updateCartTotals();
                updateCartCount();
                showToast('Success', 'Quantity updated', 'success');
            } else {
                // Fallback if updated_item is not provided
                updateCartTotals();
                updateCartCount();
                showToast('Success', 'Quantity updated', 'success');
            }
        } else {
            throw new Error(data.message || 'Failed to update quantity');
        }
    })
    .catch(error => {
        console.error('Error updating quantity:', error);
        // Revert to original value on error and re-enable input
        if (quantityInput) {
            quantityInput.value = originalValue;
            quantityInput.disabled = false;
        }
        showToast('Error', error.message || 'An error occurred while updating quantity', 'error');
    })
    .finally(() => {
        if (quantityInput) {
            quantityInput.disabled = false;
        }
    });
}

// Handle manual input changes
function handleQuantityInputChange(event) {
    const input = event.target;
    if (!input.classList.contains('quantity-input')) return;
    
    const container = input.closest('.cart-item');
    if (!container) {
        console.warn('Could not find cart item container for quantity input');
        return;
    }
    
    const index = container.getAttribute('data-index');
    const type = container.getAttribute('data-type');
    
    if (!index) {
        console.warn('Cart item is missing data-index attribute');
        return;
    }
    
    let newQuantity = parseInt(input.value);
    if (isNaN(newQuantity) || newQuantity < 1) {
        newQuantity = 1;
        input.value = 1;
    }
    
    updateCartItemQuantity(index, newQuantity, type);
}

// Handle keyboard input for quantity fields
function handleQuantityKeyDown(event) {
    if (event.target.classList.contains('quantity-input') && event.key === 'Enter') {
        event.preventDefault();
        event.target.blur(); // Triggers the change event
    }
}

// Function to handle change item button clicks
function handleChangeItem(e) {
    if (!e.target.closest('.change-item-btn')) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const button = e.target.closest('.change-item-btn');
    if (!button) {
        console.error('âŒ Invalid change button');
        return;
    }
    
    const cartItemElement = button.closest('.cart-item');
    if (!cartItemElement) {
        console.error('âŒ Could not find cart item element');
        return;
    }
    
    // Get item details from the cart item element
    const itemId = cartItemElement.getAttribute('data-item-id');
    const itemType = cartItemElement.getAttribute('data-type');
    const itemName = cartItemElement.getAttribute('data-name');
    const itemMachine = cartItemElement.getAttribute('data-machine');
    const itemThickness = cartItemElement.getAttribute('data-thickness');
    const itemSize = cartItemElement.getAttribute('data-size');
    
    console.log('ðŸ”„ Handling change item request');
    console.log('Item ID to edit:', itemId);
    console.log('Item details from DOM:', { 
        itemType, 
        itemName, 
        itemMachine, 
        itemThickness,
        itemSize 
    });
    
    // Get the cart data
    const cart = getCart();
    console.log(`ðŸ›’ Cart loaded with ${cart.products ? cart.products.length : 0} items`);
    
    if (!cart.products || !Array.isArray(cart.products)) {
        console.error('âŒ Invalid cart data structure:', cart);
        showToast('Error', 'Invalid cart data', 'error');
        return;
    }
    
    // Try to find the item by ID first
    let item = cart.products.find(cartItem => {
        const cartItemId = cartItem.id || cartItem._id;
        return cartItemId && String(cartItemId) === String(itemId);
    });
    
    if (!item) {
        console.log('âš ï¸ Item not found by ID, trying fallback matching...');
        // Fallback to matching by name, type, and machine
        item = cart.products.find(cartItem => {
            const nameMatch = cartItem.name === itemName;
            const typeMatch = cartItem.type === itemType;
            const machineMatch = !itemMachine || cartItem.machine === itemMachine;
            return nameMatch && typeMatch && machineMatch;
        });
    }
    
    if (!item) {
        console.error('âŒ Could not find item in cart');
        console.log('Searched with:', { itemId, itemName, itemType, itemMachine });
        console.log('Available items in cart:', cart.products.map((i, idx) => ({
            index: idx,
            id: i?.id || i?._id,
            type: i?.type,
            name: i?.name,
            machine: i?.machine,
            rawItem: i
        })));
        showToast('Error', 'Could not find item in cart', 'error');
        return;
    }
    
    console.log('âœ… Found item for editing:', item);
    
    try {
        // Prepare the redirect URL based on item type
        const baseUrl = `/${item.type}s`;
        const urlParams = new URLSearchParams();
        
        // Add edit mode and item ID
        urlParams.append('edit', 'true');
        urlParams.append('item_id', item.id || item._id);
        urlParams.append('type', item.type);
        
        // Add all item properties as query parameters, excluding internal fields
        const excludeFields = ['id', '_id', 'calculations', 'createdAt', 'updatedAt', '__v'];
        
        // Add item properties as query parameters
        for (const [key, value] of Object.entries(item)) {
            if (value !== null && value !== undefined && !excludeFields.includes(key)) {
                try {
                    const paramValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                    urlParams.append(key, paramValue);
                } catch (err) {
                    console.warn(`Could not stringify property ${key}:`, err);
                }
            }
        }
        
        // Add company information if available - check both localStorage and sessionStorage
        let company = null;
        
        // First try localStorage
        const storedCompany = localStorage.getItem('selectedCompany');
        if (storedCompany) {
            try {
                company = JSON.parse(storedCompany);
                console.log('Found company in localStorage:', company);
            } catch (e) {
                console.warn('Could not parse company info from localStorage:', e);
            }
        }
        
        // If not found in localStorage, try sessionStorage
        if (!company) {
            const sessionCompany = sessionStorage.getItem('selectedCompany');
            if (sessionCompany) {
                try {
                    company = JSON.parse(sessionCompany);
                    console.log('Found company in sessionStorage:', company);
                    // Save to localStorage for persistence
                    localStorage.setItem('selectedCompany', sessionCompany);
                } catch (e) {
                    console.warn('Could not parse company info from sessionStorage:', e);
                }
            }
        }
        
        // If we have company info, add it to the URL
        if (company) {
            urlParams.append('company_id', company.id || '');
            urlParams.append('company_name', encodeURIComponent(company.name || ''));
            urlParams.append('company_email', encodeURIComponent(company.email || ''));
            console.log('Added company info to URL params');
        } else {
            console.warn('No company information found in storage');
        }
        
        // Add a timestamp to prevent caching
        urlParams.append('_', Date.now());
        
        // Build the final URL
        const finalUrl = `${baseUrl}?${urlParams.toString()}`;
        
        console.log('ðŸ”— Redirecting to edit page:', finalUrl);
        window.location.href = finalUrl;
        
    } catch (error) {
        console.error('âŒ Error preparing item for editing:', error);
        showToast('Error', 'Failed to prepare item for editing', 'error');
    }
}

// Function to set up remove handlers using event delegation
function setupRemoveHandlers() {
    // Remove any existing event listeners to prevent duplicates
    document.removeEventListener('click', handleRemoveClick);
    
    // Add event delegation for remove buttons
    document.addEventListener('click', handleRemoveClick);
}

// Handle remove button clicks using event delegation
function handleRemoveClick(e) {
    // Find the closest remove button that was clicked
    const removeBtn = e.target.closest('.remove-item-btn');
    if (!removeBtn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Add loading state to the button
    const originalHtml = removeBtn.innerHTML;
    removeBtn.disabled = true;
    removeBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Removing...';
    
    // Get the item element and its ID
    const itemElement = removeBtn.closest('.cart-item');
    if (!itemElement) {
        console.error('Could not find cart item element');
        showToast('Error', 'Could not identify item to remove', 'error');
        removeBtn.innerHTML = originalHtml;
        removeBtn.disabled = false;
        return;
    }
    
    // Get the item ID from the data attribute
    const itemId = itemElement.getAttribute('data-item-id');
    if (!itemId) {
        console.error('Item has no data-item-id attribute');
        showToast('Error', 'Could not identify item to remove', 'error');
        removeBtn.innerHTML = originalHtml;
        removeBtn.disabled = false;
        return;
    }
    
    // Show confirmation dialog
    const itemName = itemElement.getAttribute('data-name') || 'this item';
    if (confirm(`Are you sure you want to remove ${itemName} from your cart?`)) {
        console.log('Removing item with ID:', itemId);
        removeFromCart(e, itemId, () => {
            // Re-enable button after removal is complete
            removeBtn.innerHTML = originalHtml;
            removeBtn.disabled = false;
        });
    } else {
        // Reset button if user cancels
        removeBtn.innerHTML = originalHtml;
        removeBtn.disabled = false;
    }
}

// Function to remove item from cart using item ID
function removeFromCart(event, itemId, callback) {
    // Prevent default form submission if called from a form
    if (event && event.preventDefault) {
        event.preventDefault();
    }
    
    // Get the item element for better UX
    const itemElement = event ? event.target.closest('.cart-item') : document.querySelector(`.cart-item[data-item-id="${itemId}"]`);
    const button = event ? event.target.closest('button') : null;
    const originalHtml = button ? button.innerHTML : '';
    
    // Show loading state
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Removing...';
    }
    
    const csrfToken = getCSRFToken();
    
    // First, find the item in the cart to get its exact ID format
    let cart = { products: [] };
    try {
        const cartData = localStorage.getItem('cart');
        if (cartData) {
            const parsed = JSON.parse(cartData);
            cart = Array.isArray(parsed) ? { products: parsed } : parsed;
            
            if (!Array.isArray(cart.products)) {
                cart.products = [];
            }
            
            // Find the item by ID, handling both string and ObjectId formats
            const item = cart.products.find(item => {
                if (!item) return false;
                const cartItemId = item.id || item._id;
                // Convert both to string for comparison to handle ObjectId
                return String(cartItemId) === String(itemId);
            });
            
            if (item) {
                // Use the exact ID from the cart item for the request
                itemId = item.id || item._id;
            }
        }
    } catch (error) {
        console.error('Error finding item in cart:', error);
    }
    
    // Make API call to remove item from cart
    fetch('/remove_from_cart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({ item_id: itemId })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Fade out the item
            if (itemElement) {
                itemElement.style.opacity = '0.5';
                itemElement.style.transition = 'opacity 0.3s ease';
                
                // Wait for the fade-out animation to complete before removing
                setTimeout(() => {
                    itemElement.remove();
                    
                    // Update cart count and total
                    updateCartCount(data.cart_count || 0);
                    
                    // Show success message
                    showToast('Success', 'Item removed from cart', 'success');
                    
                    // If no items left, show empty cart message
                    const cartItems = document.querySelectorAll('.cart-item');
                    if (cartItems.length === 0) {
                        document.getElementById('cartItems').style.display = 'none';
                        document.getElementById('emptyCartMessage').style.display = 'block';
                    }
                    
                    // Call the callback if provided
                    if (typeof callback === 'function') {
                        callback();
                    } else if (button) {
                        // Reset button state
                        button.innerHTML = originalHtml;
                        button.disabled = false;
                    }
                }, 300);
            }
        } else {
            throw new Error(data.error || 'Failed to remove item from cart');
        }
    })
    .catch(error => {
        console.error('Error removing item from cart:', error);
        showToast('Error', 'Failed to remove item from cart', 'error');
        
        // Reset button state on error
        if (button) {
            button.innerHTML = originalHtml;
            button.disabled = false;
        }
        
        // Call the callback if provided
        if (typeof callback === 'function') {
            callback();
        }
    });
}

// Function to update item display with all price information
function updateItemDisplay(item, data) {
    if (!item || !data) return;
    
    // Initialize variables to avoid reference errors
    let discountAmount = 0;
    let discountPercent = 0;
    let quantity = 1;
    let gstAmount = 0;
    let total = 0;
    
    // Update the data attributes with the latest values
    if (data.type === 'blanket') {
        item.dataset.basePrice = data.base_price || 0;
        item.dataset.barPrice = data.bar_price || 0;
        item.dataset.quantity = data.quantity || 1;
        item.dataset.discountPercent = data.discount_percent || 0;
        item.dataset.gstPercent = data.gst_percent || 18;
    } else if (data.type === 'mpack') {
        item.dataset.unitPrice = data.unit_price || 0;
        item.dataset.quantity = data.quantity || 1;
        item.dataset.discountPercent = data.discount_percent || 0;
        item.dataset.gstPercent = data.gst_percent || 12;
    }
    
    // Update the quantity input
    const quantityInput = item.querySelector('.quantity-input');
    if (quantityInput) {
        quantityInput.value = data.quantity || 1;
    }
    
    // Update the price displays
    if (data.type === 'blanket') {
        // Get dimensions and rates from data or fall back to item attributes
        const length = parseFloat(data.length || item.getAttribute('data-length') || 0) / 1000; // Convert mm to m
        const width = parseFloat(data.width || item.getAttribute('data-width') || 0) / 1000; // Convert mm to m
        const areaSqM = length * width;
        const ratePerSqMt = parseFloat(data.rate_per_sqmt || item.getAttribute('data-rate-per-sqmt') || 0);
        
        // Calculate all required values
        const basePrice = parseFloat(data.base_price || (areaSqM * ratePerSqMt));
        const barPrice = parseFloat(data.bar_price || item.getAttribute('data-bar-price') || 0);
        const unitPrice = basePrice; // Unit price is just the base price without bar price
        const netPricePerPiece = basePrice + barPrice; // Total price per piece including bar price
        const quantity = parseInt(data.quantity || 1);
        const subtotal = netPricePerPiece * quantity;
        discountPercent = parseFloat(data.discount_percent || item.getAttribute('data-discount-percent') || 0);
        discountAmount = (subtotal * discountPercent) / 100;
        const totalBeforeGst = subtotal - discountAmount;
        const gstPercent = parseFloat(data.gst_percent || item.getAttribute('data-gst-percent') || 18);
        const gstAmount = (totalBeforeGst * gstPercent) / 100;
        const total = totalBeforeGst + gstAmount;
        
        // Update unit price display (show only the base price)
        const unitPriceElement = item.querySelector('.unit-price');
        const unitPriceInput = item.querySelector('.unit-price-value');
        if (unitPriceElement && unitPriceInput) {
            unitPriceElement.textContent = `₹${basePrice.toFixed(2)}`;
            unitPriceInput.value = basePrice.toFixed(2);
        }
        
        // Update bar price display
        const barPriceElement = item.querySelector('.bar-price');
        const barPriceInput = item.querySelector('.bar-price-value');
        if (barPriceElement && barPriceInput) {
            barPriceElement.textContent = `+₹${barPrice.toFixed(2)}`;
            barPriceInput.value = barPrice.toFixed(2);
        }
        
        // Update net price per piece (base + bar price)
        const netPriceElement = item.querySelector('.net-price');
        if (netPriceElement) {
            netPriceElement.textContent = `₹${netPricePerPiece.toFixed(2)} (Base: ₹${basePrice.toFixed(2)} + Bar: ₹${barPrice.toFixed(2)})`;
        }
        
        // Update quantity display
        const quantityDisplayElement = item.querySelector('.quantity-display');
        if (quantityDisplayElement) {
            quantityDisplayElement.textContent = quantity;
        }
        
        // Update subtotal (net price Ã— quantity)
        const subtotalDisplayElement = item.querySelector('.subtotal');
        if (subtotalDisplayElement) {
            subtotalDisplayElement.textContent = `₹${subtotal.toFixed(2)}`;
        }
        
        // Update discount
        const discountDisplayElement = item.querySelector('.discount-amount');
        if (discountDisplayElement) {
            discountDisplayElement.textContent = `₹${discountAmount.toFixed(2)}`;
        }
        
        // Update total before GST
        const totalBeforeGstElement = item.querySelector('.total-before-gst');
        if (totalBeforeGstElement) {
            totalBeforeGstElement.textContent = `₹${totalBeforeGst.toFixed(2)}`;
            // Also update any other elements that might be showing the pre-GST total
            const preGstElements = item.querySelectorAll('.pre-gst-total, .total-before-gst');
            preGstElements.forEach(el => {
                el.textContent = `₹${totalBeforeGst.toFixed(2)}`;
            });
        }
        
        // Update GST
        const gstElement = item.querySelector('.gst-amount');
        if (gstElement) {
            gstElement.textContent = `₹${gstAmount.toFixed(2)}`;
        }
        
        // Update total
        const totalElement = item.querySelector('.total-amount') || item.querySelector('.item-total') || item.querySelector('.total-value');
        if (totalElement) {
            totalElement.textContent = `₹${total.toFixed(2)}`;
        }
        
        // Update hidden inputs
        const hiddenGstInput = item.querySelector('input[name$="_gst_amount"]');
        if (hiddenGstInput) {
            hiddenGstInput.value = gstAmount.toFixed(2);
        }
        
        const hiddenTotalInput = item.querySelector('input[name$="_total"]');
        if (hiddenTotalInput) {
            hiddenTotalInput.value = total.toFixed(2);
        }
    } else if (data.type === 'mpack') {
        // Initialize variables at function scope
        let unitPrice, quantity, subtotal, discountPercent, discountAmount, totalBeforeGst, gstPercent;
        
        try {
            // Handle mpack items
            unitPrice = parseFloat(data.unit_price || item.getAttribute('data-unit-price') || 0);
            quantity = parseInt(data.quantity || 1);
            subtotal = unitPrice * quantity;
            discountPercent = parseFloat(data.discount_percent || item.getAttribute('data-discount-percent') || 0);
            discountAmount = (subtotal * discountPercent) / 100;
            totalBeforeGst = subtotal - discountAmount;
            gstPercent = parseFloat(data.gst_percent || item.getAttribute('data-gst-percent') || 12);
            gstAmount = (totalBeforeGst * gstPercent) / 100;
            total = totalBeforeGst + gstAmount;
            
            // Update all item data attributes from the data object
            const dataAttributes = {
                'data-unit-price': unitPrice,
                'data-quantity': quantity,
                'data-discount-percent': discountPercent,
                'data-gst-percent': gstPercent,
                'data-thickness': data.thickness || item.getAttribute('data-thickness'),
                'data-size': data.size || item.getAttribute('data-size'),
                'data-machine': data.machine || item.getAttribute('data-machine'),
                'data-type': data.type || item.getAttribute('data-type'),
                'data-name': data.name || item.getAttribute('data-name')
            };
            
            // Set all data attributes on the item
            Object.entries(dataAttributes).forEach(([key, value]) => {
                if (value !== null && value !== undefined) {
                    item.setAttribute(key, value);
                }
            });
            
            // Debug logging
            console.log('MPack update:', { 
                unitPrice, 
                quantity, 
                subtotal, 
                discountPercent, 
                discountAmount, 
                totalBeforeGst, 
                gstPercent, 
                gstAmount, 
                total,
                dataAttributes
            });
            
            // Update all display elements with the latest data
            const updateElement = (selector, value, suffix = '') => {
                const elements = item.querySelectorAll(selector);
                elements.forEach(el => {
                    if (el) el.textContent = value + (suffix ? ` ${suffix}` : '');
                });
            };

            // Update all price displays
            const updatePriceElement = (selector, value, prefix = '₹') => {
                const elements = item.querySelectorAll(selector);
                elements.forEach(el => {
                    if (el) el.textContent = `${prefix}${value.toFixed(2)}`;
                });
            };

            // Update thickness display
            const thickness = data.thickness || item.getAttribute('data-thickness');
            if (thickness) {
                updateElement('.thickness-value, .item-thickness', thickness, 'micron');
            }
            
            // Update size display
            const size = data.size || item.getAttribute('data-size');
            if (size) {
                // Update the data attribute
                item.setAttribute('data-size', size);
                
                // Update all size displays in the item
                const sizeDisplays = item.querySelectorAll('.size-value, .mpack-size, .item-size, .size-display .size-value');
                sizeDisplays.forEach(display => {
                    if (display.classList.contains('size-display')) {
                        // If it's the container, update the span inside it
                        const span = display.querySelector('span.size-value');
                        if (span) span.textContent = size;
                    } else {
                        // Direct update for other elements
                        display.textContent = size;
                    }
                });
                console.log('Updated size display to:', size);
            }
            
            // Update machine display
            const machine = data.machine || item.getAttribute('data-machine');
            if (machine) {
                updateElement('.machine-value, .item-machine', machine);
            }
            
            // Update type display
            const type = data.type || item.getAttribute('data-type');
            if (type) {
                updateElement('.type-value, .item-type', type);
            }
            
            // Update quantity display
            updateElement('.quantity-display, .item-quantity', quantity);
            
            // Update price displays
            updatePriceElement('.unit-price, .item-unit-price', unitPrice);
            updatePriceElement('.subtotal, .item-subtotal', subtotal);
            updatePriceElement('.discount-amount, .item-discount', discountAmount);
            updatePriceElement('.total-before-gst, .pre-gst-total, .item-total-before-gst', totalBeforeGst);
            updatePriceElement('.gst-amount, .item-gst', gstAmount);
            updatePriceElement('.total-amount, .item-total, .total-value', total);
            
            // Update hidden inputs
            const hiddenGstInput = item.querySelector('input[name$="_gst_amount"]');
            if (hiddenGstInput) {
                hiddenGstInput.value = gstAmount.toFixed(2);
            }
            
            const hiddenTotalInput = item.querySelector('input[name$="_total"]');
            if (hiddenTotalInput) {
                hiddenTotalInput.value = total.toFixed(2);
            }
            
            // Debug log the final state
            console.log('Updated MPack item display:', {
                unitPrice,
                quantity,
                subtotal,
                discountAmount,
                totalBeforeGst,
                gstAmount,
                total,
                size,
                thickness,
                machine,
                type
            });
            
            // Update discount row if it exists
            const discountRow = item.querySelector('.discount-row');
            if (discountRow) {
                if (discountPercent > 0) {
                    discountRow.style.display = 'flex';
                    const discountAmountElement = discountRow.querySelector('.discount-amount') || 
                                               discountRow.querySelector('.discount-value') ||
                                               discountRow.querySelector('span:last-child');
                    if (discountAmountElement) {
                        discountAmountElement.textContent = `-₹${discountAmount.toFixed(2)}`;
                    }
                    const discountPercentElement = discountRow.querySelector('.discount-percent');
                    if (discountPercentElement) {
                        discountPercentElement.textContent = `${discountPercent}%`;
                    }
                } else {
                    discountRow.style.display = 'none';
                }
            }
            
            // Update cart totals after item updates
            updateCartTotals();
        } catch (error) {
            console.error('Error updating MPack item display:', error);
            showToast('Error', 'Failed to update MPack item. Please refresh the page.', 'error');
            return; // Exit the function if there's an error
        }
        
        // Update GST row if it exists
        const gstRow = item.querySelector('.gst-row');
        if (gstRow) {
            const gstAmountElement = gstRow.querySelector('.gst-amount') || 
                                   gstRow.querySelector('span:last-child');
            if (gstAmountElement) {
                gstAmountElement.textContent = `₹${gstAmount.toFixed(2)}`;
            }
            const gstPercentElement = gstRow.querySelector('.gst-percent');
            if (gstPercentElement) {
                gstPercentElement.textContent = `${gstPercent}%`;
            }
        }
        
        // Update pre-GST total
        const preGstTotalElement = item.querySelector('.pre-gst-total .pre-gst-amount');
        if (preGstTotalElement) {
            preGstTotalElement.textContent = `₹${taxableAmount.toFixed(2)}`;
        }
        
        // Update total
        const totalElement = item.querySelector('.total-value');
        if (totalElement) {
            totalElement.textContent = `₹${total.toFixed(2)}`;
        }
    }
    
    // Removed recursive call to prevent infinite loop
}

// End of file

