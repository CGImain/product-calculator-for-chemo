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
            
            const pricePerUnit = basePrice + barPrice;
            const subtotal = pricePerUnit * quantity;
            const discountAmount = subtotal * (discountPercent / 100);
            const discountedSubtotal = subtotal - discountAmount;
            const gstAmount = (discountedSubtotal * gstPercent) / 100;
            const finalTotal = discountedSubtotal + gstAmount;
            
            item.calculations = {
                pricePerUnit: round(pricePerUnit, 2),
                subtotal: round(subtotal, 2),
                discountAmount: round(discountAmount, 2),
                discountedSubtotal: round(discountedSubtotal, 2),
                gstAmount: round(gstAmount, 2),
                finalTotal: round(finalTotal, 2)
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

    // Create toast
    const toast = document.createElement('div');
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
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
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

// Initialize company info from session storage
function initCompanyInfo() {
    const storedCompany = localStorage.getItem('selectedCompany');
    if (storedCompany) {
        try {
            const company = JSON.parse(storedCompany);
            updateCompanyDisplay(company.name, company.email);
        } catch (e) {
            console.error('Error parsing stored company:', e);
        }
    }
}

// Update company display in the navigation
function updateNavCompanyDisplay(companyName) {
    const companyDisplay = document.getElementById('companyNameDisplay');
    if (companyDisplay) {
        companyDisplay.textContent = companyName || 'No company selected';
    }
}

// Initialize cart when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded, initializing cart...');
    
    // First try to get company info from sessionStorage
    const companyName = sessionStorage.getItem('companyName');
    const companyEmail = sessionStorage.getItem('companyEmail');
    
    if (companyName && companyName !== 'undefined') {
        updateCompanyDisplay(companyName, companyEmail || '');
    } else {
        // Fall back to localStorage if sessionStorage doesn't have it
        initCompanyInfo();
    }
    
    // Also update the company display in the navigation
    updateNavCompanyDisplay(companyName || '');
    
    // Handle change company button click
    const changeCompanyBtn = document.getElementById('changeCompanyBtn');
    if (changeCompanyBtn) {
        changeCompanyBtn.addEventListener('click', function() {
            // Redirect to product selection page which will handle company change
            window.location.href = '/select-product';
        });
    }
    
    // Initialize all cart handlers
    function initializeCart() {
        // Set up event handlers first
        setupQuantityHandlers();
        setupRemoveHandlers();
        
        // Initialize calculations
        initializeCartCalculations();
        
        // Update UI
        updateCartCount();
        updateCartTotals();
        
        // Check if we need to show the empty cart message
        const cartItems = document.querySelectorAll('.cart-item');
        const emptyCartDiv = document.getElementById('emptyCart');
        const cartItemsDiv = document.getElementById('cartItems');
        
        if (cartItems.length === 0) {
            if (emptyCartDiv) emptyCartDiv.style.display = 'block';
            if (cartItemsDiv) cartItemsDiv.style.display = 'none';
        } else {
            if (emptyCartDiv) emptyCartDiv.style.display = 'none';
            if (cartItemsDiv) cartItemsDiv.style.display = 'block';
        }
    }
    
    // Initialize the cart
    initializeCart();
    
    // Add debug logs for remove button clicks
    document.addEventListener('click', function(event) {
        if (event.target.closest('.remove-item-form')) {
            console.log('Remove button clicked');
        }
    });
});

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

function updateCartTotals() {
    let total = 0; // total after GST per item
    let totalItems = 0;
    const cartItems = document.querySelectorAll('.cart-item');
    
    // Show/hide empty cart message
    const emptyCart = document.getElementById('emptyCart');
    const cartItemsContainer = document.getElementById('cartItems');
    
    if (cartItems.length === 0) {
        if (emptyCart) emptyCart.style.display = 'block';
        if (cartItemsContainer) cartItemsContainer.style.display = 'none';
        
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
    
    cartItems.forEach(item => {
        const type = item.dataset.type;
        const quantity = parseInt(item.dataset.quantity) || 1;
        
        if (type === 'mpack') {
            // Get price from data attributes or calculations
            const unitPrice = parseFloat(item.dataset.unitPrice) || 0;
            const discountPercent = parseFloat(item.dataset.discountPercent) || 0;
            const gstPercent = parseFloat(item.dataset.gstPercent) || 12;
            
            // Calculate prices for mpack
            const subtotal = unitPrice * quantity;
            const discountAmount = subtotal * (discountPercent / 100);
            const discountedSubtotal = subtotal - discountAmount;
            const gstAmount = (discountedSubtotal * gstPercent) / 100;
            const finalTotal = discountedSubtotal + gstAmount;
            
            // Update item's price display
            updateItemDisplay(item, {
                finalTotal,
                discountAmount,
                gstAmount,
                quantity
            });
            
            total += finalTotal;
            totalItems += quantity;
            
        } else if (type === 'blanket') {
            const basePrice = parseFloat(item.dataset.basePrice) || 0;
            const barPrice = parseFloat(item.dataset.barPrice) || 0;
            const pricePerUnit = basePrice + barPrice;
            const discountPercent = parseFloat(item.dataset.discountPercent) || 0;
            const gstPercent = parseFloat(item.dataset.gstPercent) || 18;
            
            // Calculate prices for blanket
            const subtotalItem = pricePerUnit * quantity;
            const discountAmount = subtotalItem * (discountPercent / 100);
            const discountedSubtotal = subtotalItem - discountAmount;
            const gstAmount = (discountedSubtotal * gstPercent) / 100;
            const finalTotal = discountedSubtotal + gstAmount;
            
            // Update item's price display
            updateItemDisplay(item, {
                finalTotal,
                discountAmount,
                gstAmount,
                quantity
            });
            
            total += finalTotal;
            totalItems += quantity;
        }
    });
    
    // Update the cart summary with total after GST
    const cartSummary = document.getElementById('cartSummary');
    if (cartSummary) {
        const orderTotal = Math.round(total * 100) / 100;
        cartSummary.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Order Summary</h5>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="fw-bold">Total (${totalItems} ${totalItems === 1 ? 'item' : 'items'}):</span>
                        <span class="fw-bold fs-5">₹${orderTotal.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
    }
}

function setupQuantityHandlers() {
    // Quantity change functionality removed as per requirements
}

function setupRemoveHandlers() {
    // Use event delegation for remove item buttons
    document.addEventListener('click', function(event) {
        // Check if the clicked element or any of its parents have the remove-item-form class
        const removeForm = event.target.closest('.remove-item-form');
        if (removeForm) {
            event.preventDefault();
            const index = removeForm.dataset.index;
            if (confirm('Are you sure you want to remove this item from your cart?')) {
                removeCartItem(index);
            }
        }
    });
}

function updateCartItemQuantity(index, newQuantity) {
    // Quantity updates are not allowed
}

function removeCartItem(index) {
    console.log('Attempting to remove item at index:', index);
    const itemElement = document.querySelector(`.cart-item[data-index="${index}"]`);
    
    if (!itemElement) {
        console.error('Item element not found in DOM');
        showToast('Error', 'Item not found in cart', 'error');
        return;
    }
    
    // Show loading state
    const originalContent = itemElement.innerHTML;
    itemElement.innerHTML = '<td colspan="10" class="text-center py-3"><div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Loading...</span></div> Removing item...</td>';
    
    fetch('/remove_from_cart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
        },
        body: JSON.stringify({ index: parseInt(index) })
    })
    .then(response => {
        console.log('Response status:', response.status);
        if (!response.ok) {
            return response.json().then(err => { 
                console.error('Server error:', err);
                throw err; 
            });
        }
        return response.json();
    })
    .then(data => {
        console.log('Remove from cart response:', data);
        if (data.success) {
            // Remove the item from the UI
            itemElement.remove();
            
            // Update cart count
            updateCartCount(data.cart_count || 0);
            
            // Update totals
            updateCartTotals();
            
            // Show success message
            showToast('Success', 'Item removed from cart', 'success');
            
            // Check if cart is empty and show empty message if needed
            const cartItems = document.querySelectorAll('.cart-item');
            if (cartItems.length === 0) {
                document.getElementById('emptyCart').style.display = 'block';
                document.getElementById('cartItems').style.display = 'none';
                document.getElementById('cartTotals').style.display = 'none';
                document.getElementById('checkoutSection').style.display = 'none';
            }
            
            // Update any other UI elements that might depend on cart items
            updateAllItemIndices();
        } else {
            throw new Error(data.error || 'Failed to remove item');
        }
    })
    .catch(error => {
        console.error('Error removing item:', error);
        // Restore original content on error
        itemElement.innerHTML = originalContent;
        showToast('Error', error.message || 'An error occurred while removing the item', 'error');
    });
}

function updateAllItemIndices() {
    // Update data-index attributes of all cart items to match their new positions
    const items = document.querySelectorAll('.cart-item');
    items.forEach((item, index) => {
        item.setAttribute('data-index', index);
        // Update any remove buttons or other elements that might reference the index
        const removeBtn = item.querySelector('.remove-item-btn');
        if (removeBtn) {
            removeBtn.setAttribute('data-index', index);
            removeBtn.onclick = function() {
                if (confirm('Are you sure you want to remove this item from your cart?')) {
                    removeCartItem(index);
                }
            };
        }
    });
}


// Calculate product prices based on type (without quantity handling)
function calculateProductPrices(container) {
    if (container.dataset.type === 'mpack') {
        calculateMPackPrices(container);
    } else if (container.dataset.type === 'blanket') {
        calculateBlanketPrices(container);
    }
}

// Calculate MPack prices
function calculateMPackPrices(container) {
    try {
        // Get data attributes
        const unitPrice = parseFloat(container.dataset.unitPrice) || 0;
        const quantity = parseInt(container.dataset.quantity) || 1;
        const discountPercent = parseFloat(container.dataset.discountPercent) || 0;
        const gstPercent = parseFloat(container.dataset.gstPercent) || 18;
        
        // Calculate prices
        const subtotal = unitPrice * quantity;
        const discountAmount = subtotal * (discountPercent / 100);
        const priceAfterDiscount = subtotal - discountAmount;
        const gstAmount = (priceAfterDiscount * gstPercent) / 100;
        const finalTotal = priceAfterDiscount + gstAmount;
        
        // Update the data attributes for dynamic calculations
        container.dataset.unitPrice = unitPrice;
        container.dataset.quantity = quantity;
        container.dataset.discountPercent = discountPercent;
        container.dataset.gstPercent = gstPercent;
        
        // Find or create price elements
        let priceGrid = container.querySelector('.price-grid');
        if (!priceGrid) {
            priceGrid = document.createElement('div');
            priceGrid.className = 'price-grid';
            container.appendChild(priceGrid);
        } else {
            priceGrid.innerHTML = ''; // Clear existing content
        }
        
        // Create a container for the left-aligned content
        const leftContainer = document.createElement('div');
        leftContainer.className = 'mpack-left-content';
        priceGrid.appendChild(leftContainer);

        // Add heading
        const heading = document.createElement('div');
        heading.className = 'price-heading fw-bold mb-2';
        heading.textContent = 'MPack';
        leftContainer.appendChild(heading);

        // Add machine, thickness, and size details
        const details = [
            { label: 'Machine', value: container.dataset.machine },
            { label: 'Thickness', value: container.dataset.thickness },
            { label: 'Size', value: container.dataset.size }
        ];

        details.forEach(({label, value}) => {
            if (!value) return; // Skip if value is empty
            const detailRow = document.createElement('div');
            detailRow.className = 'price-detail';
            detailRow.innerHTML = `<strong>${label}:</strong> <span>${value}</span>`;
            leftContainer.appendChild(detailRow);
        });

        // Add a divider
        const divider = document.createElement('div');
        divider.className = 'border-top my-2';
        leftContainer.appendChild(divider);

        // Create price rows container
        const priceContainer = document.createElement('div');
        priceContainer.className = 'price-container';
        leftContainer.appendChild(priceContainer);

        const createPriceRow = (label, value, isBold = false) => {
            const row = document.createElement('div');
            row.className = `price-row d-flex justify-content-between ${isBold ? 'fw-bold' : ''}`;
            row.innerHTML = `
                <span class="price-label">${label}</span>
                <span class="price-value">${value}</span>
            `;
            return row;
        };
        
        // Add quantity row with controls first
        const quantityRow = document.createElement('div');
        quantityRow.className = 'price-row d-flex justify-content-between align-items-center mb-2';
        quantityRow.innerHTML = `
            <span class="price-label">Quantity:</span>
            <div class="d-flex align-items-center">
                <button class="btn btn-sm btn-outline-secondary quantity-decrease" data-index="${container.dataset.index}">-</button>
                <input type="number" class="form-control form-control-sm mx-1 quantity-input" 
                       value="${quantity}" min="1" style="width: 60px;" 
                       data-index="${container.dataset.index}">
                <button class="btn btn-sm btn-outline-secondary quantity-increase" data-index="${container.dataset.index}">+</button>
            </div>
        `;
        priceContainer.appendChild(quantityRow);
        
        // Add unit price row
        priceContainer.appendChild(createPriceRow('Unit Price:', `₹${unitPrice.toFixed(2)}`));
        // Add subtotal row
        priceContainer.appendChild(createPriceRow('Subtotal:', `₹${subtotal.toFixed(2)}`));
        
        // Add discount row if applicable
        if (discountPercent > 0) {
            priceContainer.appendChild(createPriceRow(
                `Discount (${discountPercent}%):`, 
                `-₹${discountAmount.toFixed(2)}`
            ));
        }
        
        // Add GST row
        priceContainer.appendChild(createPriceRow(
            `GST (${gstPercent}%):`, 
            `₹${gstAmount.toFixed(2)}`
        ));
        
        // Add total row with border top
        const totalRow = createPriceRow('Total:', `₹${finalTotal.toFixed(2)}`, true);
        totalRow.classList.add('border-top', 'pt-2', 'mt-2');
        priceContainer.appendChild(totalRow);
        
        // Remove button is now in the template
        
        return {
            unitPrice,
            quantity,
            discountPercent,
            discountAmount,
            priceAfterDiscount,
            gstPercent,
            gstAmount,
            finalTotal
        };
        
    } catch (error) {
        console.error('Error in calculateMPackPrices:', error);
        return null;
    }
}

// Calculate Blanket prices
function calculateBlanketPrices(container) {
    // Get data attributes
    const basePrice = parseFloat(container.dataset.basePrice) || 0;
    const barPrice = parseFloat(container.dataset.barPrice) || 0;
    const quantity = parseInt(container.dataset.quantity) || 1;
    const discountPercent = parseFloat(container.dataset.discountPercent) || 0;
    const gstPercent = parseFloat(container.dataset.gstPercent) || 18;
    
    // Calculate prices
    const pricePerUnit = basePrice + barPrice;
    const subtotal = pricePerUnit * quantity;
    const discountAmount = subtotal * (discountPercent / 100);
    const discountedSubtotal = subtotal - discountAmount;
    const gstAmount = (discountedSubtotal * gstPercent) / 100;
    const finalTotal = discountedSubtotal + gstAmount;
    
    // Update the data attributes
    container.dataset.basePrice = basePrice;
    container.dataset.barPrice = barPrice;
    container.dataset.quantity = quantity;
    container.dataset.discountPercent = discountPercent;
    container.dataset.gstPercent = gstPercent;
    
    // Update the UI
    let priceGrid = container.querySelector('.price-grid');
    if (!priceGrid) {
        // Create a new grid if it doesn't exist (keeps layout consistent with MPack products)
        priceGrid = document.createElement('div');
        priceGrid.className = 'price-grid';
        container.appendChild(priceGrid);
    } else {
        // Clear existing content before re-building
        priceGrid.innerHTML = '';
    }
        
        const createPriceRow = (label, value, isBold = false) => {
            const row = document.createElement('div');
            row.className = `price-row d-flex justify-content-between ${isBold ? 'fw-bold' : ''}`;
            row.innerHTML = `
                <span class="price-label">${label}</span>
                <span class="price-value">${value}</span>
            `;
            return row;
        };
        
        // Add base price row
        priceGrid.appendChild(createPriceRow('Base Price:', `₹${basePrice.toFixed(2)}`));
        
        // Add bar price row if applicable
        if (barPrice > 0) {
            priceGrid.appendChild(createPriceRow('Barring:', `+₹${barPrice.toFixed(2)}`));
        }
        
        // Add unit price row
        priceGrid.appendChild(createPriceRow('Unit Price:', `₹${pricePerUnit.toFixed(2)}`));
        // Add subtotal row
        priceGrid.appendChild(createPriceRow('Subtotal:', `₹${subtotal.toFixed(2)}`));
        
        // Add quantity row with controls
        const quantityRow = document.createElement('div');
        quantityRow.className = 'price-row d-flex justify-content-between align-items-center';
        quantityRow.innerHTML = `
            <span class="price-label">Quantity:</span>
            <div class="d-flex align-items-center">
                <button class="btn btn-sm btn-outline-secondary quantity-decrease" data-index="${container.dataset.index}">-</button>
                <input type="number" class="form-control form-control-sm mx-1 quantity-input" 
                       value="${quantity}" min="1" style="width: 60px;" 
                       data-index="${container.dataset.index}">
                <button class="btn btn-sm btn-outline-secondary quantity-increase" data-index="${container.dataset.index}">+</button>
            </div>
        `;
        priceGrid.appendChild(quantityRow);
        
        // Add discount row if applicable
        if (discountPercent > 0) {
            priceGrid.appendChild(createPriceRow(
                `Discount (${discountPercent}%):`, 
                `-₹${discountAmount.toFixed(2)}`
            ));
        }
        
        // Add GST row
        priceGrid.appendChild(createPriceRow(
            `GST (${gstPercent}%):`, 
            `₹${gstAmount.toFixed(2)}`
        ));
        
        // Add total row
        priceGrid.appendChild(createPriceRow(
            'Total:', 
            `₹${finalTotal.toFixed(2)}`,
            true
        ));
    
    return {
        basePrice,
        barPrice,
        pricePerUnit,
        quantity,
        discountPercent,
        discountAmount,
        discountedSubtotal,
        gstPercent,
        gstAmount,
        finalTotal
    };
}

// Update the item's price grid based on latest calculations
function updateItemDisplay(item, data) {
    if (!item) return;

    // Update dataset values so calculateProductPrices uses latest numbers
    if (data) {
        if (data.finalTotal !== undefined) item.dataset.finalTotal = data.finalTotal;
        if (data.discountAmount !== undefined) item.dataset.discountAmount = data.discountAmount;
        if (data.gstAmount !== undefined) item.dataset.gstAmount = data.gstAmount;
        if (data.quantity !== undefined) item.dataset.quantity = data.quantity;
    }

    // Re-run the per-item calculation to regenerate the price-grid (this builds subtotal rows, etc.)
    calculateProductPrices(item);
}

// Check for duplicate MPacks in the cart
function checkForDuplicateMpacks() {
    const mpackItems = document.querySelectorAll('.cart-item[data-type="mpack"]');
    const mpackMap = new Map();
    
    mpackItems.forEach((item, index) => {
        const machine = item.dataset.machine || '';
        const thickness = item.dataset.thickness || '';
        const size = item.dataset.size || '';
        const key = `${machine}-${thickness}-${size}`.toLowerCase();
        
        if (mpackMap.has(key)) {
            // Found a duplicate
            const existingIndex = mpackMap.get(key);
            console.warn(`Duplicate MPack found at index ${index}, original at ${existingIndex}`);
            // You can add visual feedback here if needed
        } else {
            mpackMap.set(key, index);
        }
    });
}

// Initialize the check when the page loads
document.addEventListener('DOMContentLoaded', function() {
    checkForDuplicateMpacks();
    
    // Also check when cart is updated
    const observer = new MutationObserver(function() {
        checkForDuplicateMpacks();
    });
    
    const cartContainer = document.querySelector('.cart-items');
    if (cartContainer) {
        observer.observe(cartContainer, { childList: true, subtree: true });
    }
});

// End of file
