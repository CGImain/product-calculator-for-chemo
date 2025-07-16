let priceMap = {};
let currentNetPrice = 0;
let currentDiscount = 0; // Track current discount percentage
let currentThickness = ''; // Track current thickness

// Debug function to log element status
function logElementStatus(id) {
  const el = document.getElementById(id);
  console.log(`Element ${id}:`, el ? 'Found' : 'Not found');
  return el;
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("MPACK JS loaded");
  
  try {
    loadMachines();
    await loadDiscounts(); // Load discounts when the page loads
  } catch (error) {
    console.error("Error initializing page:", error);
  }

  // Debug log element statuses
  console.log("Checking required elements...");
  logElementStatus("machineSelect");
  logElementStatus("mpackSection");
  logElementStatus("thicknessSelect");
  logElementStatus("sizeSelect");
  logElementStatus("sheetInput");
  logElementStatus("discountSelect");

  // Safely add event listener to machine select
  const machineSelect = document.getElementById("machineSelect");
  const mpackSection = document.getElementById("mpackSection");
  
  if (!machineSelect) {
    console.error("machineSelect element not found!");
  }
  
  if (!mpackSection) {
    console.error("mpackSection element not found!");
  }
  
  if (machineSelect && mpackSection) {
    console.log("Setting up machine select change handler...");
    machineSelect.addEventListener("change", () => {
      console.log("Machine select changed, showing mpack section...");
      try {
        mpackSection.style.display = "block";
        console.log("mpackSection should now be visible");
      } catch (error) {
        console.error("Error showing mpack section:", error);
      }
    });
  }

  // Update thickness change handler to recalculate prices
  const thicknessSelect = document.getElementById("thicknessSelect");
  if (thicknessSelect) {
    thicknessSelect.addEventListener("change", () => {
      loadSizes();
      // Reset current discount when thickness changes
      currentDiscount = 0;
      const discountSelect = document.getElementById("discountSelect");
      if (discountSelect) discountSelect.value = "";
      calculateFinalPrice();
    });
  }
  
  // Update size selection handler
  const sizeSelect = document.getElementById("sizeSelect");
  if (sizeSelect) {
    sizeSelect.addEventListener("change", () => {
      handleSizeSelection();
      calculateFinalPrice();
    });
  }

  // Initialize size search functionality handler
  const sheetInput = document.getElementById("sheetInput");
  if (sheetInput) {
    sheetInput.addEventListener("input", () => {
      calculateFinalPrice();
    });
  }
  
  // Update discount select handler
  const discountSelect = document.getElementById("discountSelect");
  if (discountSelect) {
    discountSelect.addEventListener("change", () => {
      applyDiscount();
      calculateFinalPrice();
    });
  }
});

function loadMachines() {
  fetch("/api/machines")
    .then(res => res.json())
    .then(data => {
      const machineSelect = document.getElementById("machineSelect");
      const machinesArr = Array.isArray(data) ? data : data.machines;
      machinesArr.forEach(machine => {
        const opt = document.createElement("option");
        opt.value = machine.id;
        opt.textContent = machine.name;
        machineSelect.appendChild(opt);
      });
    });
}

function loadSizes() {
  const thicknessSelect = document.getElementById("thicknessSelect");
  const sizeSelect = document.getElementById("sizeSelect");
  
  if (!thicknessSelect || !sizeSelect) return;
  
  const thickness = thicknessSelect.value;
  if (!thickness) return;
  
  // Update current thickness
  currentThickness = thickness;
  
  // Show loading state
  sizeSelect.innerHTML = '<option value="">Loading sizes...</option>';
  sizeSelect.disabled = true;
  
  // Clear any previous errors
  const existingError = document.getElementById('sizeError');
  if (existingError) existingError.remove();
  
  // Show size section if not already visible
  const sizeSection = document.getElementById("sizeSection");
  if (sizeSection) sizeSection.style.display = "block";
  
  // Add cache busting to prevent caching issues
  const cacheBuster = '?v=' + new Date().getTime();
  
  // Show loading indicator
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'loadingIndicator';
  loadingIndicator.className = 'text-muted small';
  loadingIndicator.textContent = 'Loading sizes and prices...';
  sizeSelect.parentNode.insertBefore(loadingIndicator, sizeSelect.nextSibling);
  
  // Load both the sizes and prices
  Promise.all([
    // Load sizes for the selected thickness
    fetch(`/static/products/chemical/${thickness}.json${cacheBuster}`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load sizes for ${thickness} micron`);
        return res.json();
      }),
    // Load all prices
    fetch(`/static/products/chemical/price.json${cacheBuster}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load price data');
        return res.json();
      })
  ])
  .then(([sizesData, pricesData]) => {
    // Clean up loading indicator
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) loadingIndicator.remove();
    
    if (!Array.isArray(sizesData) || !Array.isArray(pricesData)) {
      throw new Error('Invalid data format received');
    }
    
    // Create price lookup map
    const priceLookup = {};
    pricesData.forEach(priceItem => {
      priceLookup[priceItem.id] = priceItem.price;
    });
    
    // Reset size select
    sizeSelect.innerHTML = '<option value="">-- Select Size --</option>';
    sizeSelect.disabled = false;
    
    // Clear and rebuild price map
    priceMap = {};
    
    // Populate size dropdown with prices
    sizesData.forEach(item => {
      const price = priceLookup[item.id] || 0;
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = `${item.width} x ${item.length}`;
      opt.dataset.price = price; // Store price in data attribute
      sizeSelect.appendChild(opt);
      priceMap[item.id] = price;
    });
    
    // Show size section
    const sizeSection = document.getElementById("sizeSection");
    if (sizeSection) sizeSection.style.display = "block";
    
    // Show other relevant sections
    const priceSection = document.getElementById("priceSection");
    const sheetInputSection = document.getElementById("sheetInputSection");
    if (priceSection) priceSection.style.display = "block";
    if (sheetInputSection) sheetInputSection.style.display = "block";
    
    // Reset discount state
    const discountSelect = document.getElementById("discountSelect");
    if (discountSelect) {
      discountSelect.value = "";
      currentDiscount = 0;
    }
    
    const finalDiscountedPrice = document.getElementById("finalDiscountedPrice");
    if (finalDiscountedPrice) finalDiscountedPrice.textContent = "0.00";
    
    const discountSection = document.getElementById("discountSection");
    if (discountSection) discountSection.style.display = "block";
    
    const discountPromptSection = document.getElementById("discountPromptSection");
    if (discountPromptSection) {
      discountPromptSection.style.display = "block";
      discountPromptSection.innerHTML = `
        <label class="form-label">Apply Discount?</label>
        <button class="btn btn-outline-primary btn-sm" onclick="showDiscountSection(true)">Yes</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="showDiscountSection(false)">No</button>
      `;
    }
  })
  .catch(err => {
    console.error(`Failed to load data for ${currentThickness} micron:`, err);
    
    // Clean up loading indicator
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) loadingIndicator.remove();
    
    // Reset size select
    const sizeSelect = document.getElementById("sizeSelect");
    if (sizeSelect) {
      sizeSelect.innerHTML = '<option value="">-- Select Size --</option>';
      sizeSelect.disabled = false;
      
      // Create or update error message
      let errorElement = document.getElementById('sizeError');
      if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = 'sizeError';
        errorElement.className = 'text-danger small mt-1';
        sizeSelect.parentNode.insertBefore(errorElement, sizeSelect.nextSibling);
      }
      errorElement.textContent = `Error: ${err.message || 'Failed to load sizes'}. Please try again.`;
      
      // Auto-hide error after 5 seconds
      if (window.errorTimeout) clearTimeout(window.errorTimeout);
      window.errorTimeout = setTimeout(() => {
        if (errorElement && errorElement.parentNode) {
          errorElement.remove();
        }
      }, 5000);
    }
  });
}

function handleSizeSelection() {
  const sizeSelect = document.getElementById("sizeSelect");
  const selectedId = sizeSelect.value;
  
  if (!selectedId) {
    resetCalculations();
    return;
  }
  
  // Show price section when a size is selected
  const priceSection = document.getElementById("priceSection");
  if (priceSection) priceSection.style.display = "block";
  
  // Update net price display safely
  currentNetPrice = parseFloat(priceMap[selectedId] || 0);
  const netPriceElement = document.getElementById("netPrice");
  if (netPriceElement) {
    netPriceElement.textContent = currentNetPrice.toFixed(2);
  }
  
  // Reset sheet input and calculate initial price
  const sheetInput = document.getElementById("sheetInput");
  if (sheetInput) {
    sheetInput.value = "1";
  }
  
  // Reset discount when size changes
  currentDiscount = 0;
  const discountSelect = document.getElementById("discountSelect");
  if (discountSelect) {
    discountSelect.value = "";
  }
  
  // Clear discount details
  const discountDetails = document.getElementById("discountDetails");
  if (discountDetails) {
    discountDetails.innerHTML = "";
  }
  
  // Update price display
  calculateFinalPrice();
}

async function loadDiscounts() {
  console.log('Loading discounts...');
  const select = document.getElementById('discountSelect');
  
  if (!select) {
    console.error('Discount select element not found');
    return;
  }
  
  try {
    // Clear existing options except the first one
    while (select.options.length > 1) {
      select.remove(1);
    }
    
    console.log('Fetching discounts from /static/data/discount.json');
    const response = await fetch('/static/data/discount.json');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Received discount data:', data);
    
    const discounts = data.discounts || [];
    console.log(`Processing ${discounts.length} discount(s)`);
    
    if (discounts.length === 0) {
      console.warn('No discounts found in the JSON file');
    }
    
    // Add new discount options
    discounts.forEach(percent => {
      const percentNum = parseFloat(percent);
      if (!isNaN(percentNum)) {
        const option = document.createElement('option');
        option.value = percentNum;
        option.textContent = `${percentNum}%`;
        select.appendChild(option);
        console.log(`Added discount option: ${percentNum}%`);
      } else {
        console.warn(`Invalid discount percentage: ${percent}`);
      }
    });
    
    // Remove any existing change event listeners to prevent duplicates
    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);
    
    // Add event listener for discount selection
    newSelect.addEventListener('change', function() {
      currentDiscount = parseFloat(this.value) || 0;
      console.log(`Selected discount: ${currentDiscount}%`);
      calculateFinalPrice();
    });
    
    console.log('Discounts loaded successfully');
    
  } catch (error) {
    console.error('Error loading discounts:', error);
    
    // Fallback to default discounts if loading fails
    console.warn('Falling back to default discounts');
    const defaultDiscounts = [5, 10, 15, 20];
    defaultDiscounts.forEach(percent => {
      const option = document.createElement('option');
      option.value = percent;
      option.textContent = `${percent}%`;
      select.appendChild(option);
      console.log(`Added default discount option: ${percent}%`);
    });
  }
}

function resetCalculations() {
  currentNetPrice = 0;
  currentDiscount = 0;
  
  // Reset input fields
  const sheetInput = document.getElementById("sheetInput");
  if (sheetInput) sheetInput.value = "1";
  
  // Reset discount select
  const discountSelect = document.getElementById("discountSelect");
  if (discountSelect) discountSelect.value = "";
  
  // Reset price summary
  const priceSummary = document.getElementById("priceSummary");
  if (priceSummary) {
    priceSummary.innerHTML = '<p class="text-muted mb-0">Select options to see pricing</p>';
  }
  
  // Reset net price display
  const netPriceElement = document.getElementById("netPrice");
  if (netPriceElement) {
    netPriceElement.textContent = "0.00";
  }
  
  // Clear discount details
  const discountDetails = document.getElementById("discountDetails");
  if (discountDetails) {
    discountDetails.innerHTML = "";
  }
  
  // Hide price section and add to cart button
  const priceSection = document.getElementById("priceSection");
  const addToCartBtn = document.getElementById("addToCartBtn");
  
  if (priceSection) {
    priceSection.style.display = "none";
  }
  
  if (addToCartBtn) {
    addToCartBtn.style.display = "none";
  }
}

function calculateFinalPrice() {
  const sheetInput = document.getElementById("sheetInput");
  const quantity = parseInt(sheetInput.value) || 0;
  const gstRate = parseFloat(document.getElementById("gstSelect").value) || 0;
  
  if (currentNetPrice <= 0) {
    resetCalculations();
    return;
  }
  
  // If quantity is 0 or negative, set to 1 for calculation but show 0 in the display
  const displayQuantity = Math.max(0, quantity);
  const calcQuantity = quantity <= 0 ? 1 : quantity;
  
  // Calculate base price without GST
  const basePrice = currentNetPrice * calcQuantity;
  
  // Apply discount if any
  const discountAmount = (basePrice * currentDiscount) / 100;
  const discountedPrice = basePrice - discountAmount;
  
  // Calculate GST on the discounted price
  const gstAmount = (discountedPrice * gstRate) / 100;
  const finalPrice = discountedPrice + gstAmount;
  
  // Update the price summary
  const priceSummary = document.getElementById("priceSummary");
  const netPriceElement = document.getElementById("netPrice");
  
  // Update net price display
  if (netPriceElement) {
    netPriceElement.textContent = currentNetPrice.toFixed(2);
  }
  
  if (priceSummary) {
    let summaryHTML = '';
    
    if (currentDiscount > 0) {
      summaryHTML = `
        <div class="d-flex justify-content-between">
          <span>Subtotal (${displayQuantity} sheets):</span>
          <span>₹${basePrice.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between text-danger">
          <span>Discount (${currentDiscount}%):</span>
          <span>-₹${discountAmount.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between">
          <span>After Discount:</span>
          <span>₹${discountedPrice.toFixed(2)}</span>
        </div>`;
    } else {
      summaryHTML = `
        <div class="d-flex justify-content-between">
          <span>Subtotal (${displayQuantity} sheets):</span>
          <span>₹${basePrice.toFixed(2)}</span>
        </div>`;
    }
    
    // Add GST and total
    summaryHTML += `
      <div class="d-flex justify-content-between">
        <span>GST (${gstRate}%):</span>
        <span>₹${gstAmount.toFixed(2)}</span>
      </div>
      <hr>
      <div class="d-flex justify-content-between fw-bold">
        <span>Total Price:</span>
        <span>₹${finalPrice.toFixed(2)}</span>
      </div>`;
    
    priceSummary.innerHTML = summaryHTML;
  }
  
  // Show add to cart button and price section
  const addToCartBtn = document.getElementById("addToCartBtn");
  const priceSection = document.getElementById("priceSection");
  
  if (addToCartBtn) {
    addToCartBtn.style.display = "block";
  }
  
  if (priceSection) {
    priceSection.style.display = "block";
  }
}

function showDiscountSection(apply) {
  const discountSection = document.getElementById("discountSection");
  const finalPrice = document.getElementById("finalPrice").textContent;
  const finalDiscountedPrice = document.getElementById("finalDiscountedPrice");

  if (!apply) {
    discountSection.style.display = "none";
    finalDiscountedPrice.textContent = finalPrice;
    return;
  }

  // Load discount options
  fetch("/static/data/discount.json")
    .then(res => res.json())
    .then(data => {
      const select = document.getElementById("discountSelect");
      select.innerHTML = '<option value="">-- Select Discount --</option>';
      data.discounts.forEach(discountStr => {
        const percent = parseFloat(discountStr);
        const opt = document.createElement("option");
        opt.value = percent;
        opt.textContent = discountStr;
        select.appendChild(opt);
      });
      discountSection.style.display = "block";
      finalDiscountedPrice.textContent = finalPrice;
    });
}

function applyDiscount() {
  const discountSelect = document.getElementById("discountSelect");
  const discountPromptSection = document.getElementById("discountPromptSection");
  
  if (!discountSelect || !discountPromptSection) return;
  
  currentDiscount = parseFloat(discountSelect.value) || 0;
  
  if (currentDiscount > 0) {
    // Update the discount prompt
    discountPromptSection.innerHTML = 
      `<button class="btn btn-sm btn-outline-primary" onclick="showDiscountSection(true)">
        Change Discount (${currentDiscount}% applied)
      </button>`;
    
    // Show the discount section and ensure it's visible
    const discountSection = document.getElementById("discountSection");
    if (discountSection) {
      discountSection.style.display = "block";
    }
    
    // Force update the price display
    calculateFinalPrice();
  } else {
    // No discount selected
    discountPromptSection.innerHTML = `
      <label class="form-label">Apply Discount?</label>
      <button class="btn btn-outline-primary btn-sm" onclick="showDiscountSection(true)">Yes</button>
      <button class="btn btn-outline-secondary btn-sm" onclick="showDiscountSection(false)">No</button>
    `;
    
    // Hide the discount section and clear any discount details
    const discountSection = document.getElementById("discountSection");
    if (discountSection) {
      discountSection.style.display = "none";
    }
    
    // Recalculate without discount
    calculateFinalPrice();
  }
}

function addMpackToCart() {
  const machineSelect = document.getElementById('machineSelect');
  const thicknessSelect = document.getElementById('thicknessSelect');
  const sizeSelect = document.getElementById('sizeSelect');
  const sheetInput = document.getElementById('sheetInput');
  const quantity = parseInt(sheetInput.value) || 1;
  
  if (!machineSelect.value || !thicknessSelect.value || !sizeSelect.value || !sheetInput.value) {
    showToast('Error', 'Please fill in all required fields', 'error');
    return;
  }

  // Get discount information
  const discountSelect = document.getElementById('discountSelect');
  const discount = discountSelect ? parseFloat(discountSelect.value) || 0 : 0;
  
  // Calculate prices
  let unitPrice = parseFloat(document.getElementById('netPrice').textContent) || 0;
  let totalPriceBeforeDiscount = unitPrice * quantity;
  let discountAmount = (totalPriceBeforeDiscount * discount) / 100;
  let priceAfterDiscount = totalPriceBeforeDiscount - discountAmount;
  
  // Add GST (12% as per the form)
  const gstRate = 0.12;
  const gstAmount = priceAfterDiscount * gstRate;
  const finalPrice = priceAfterDiscount + gstAmount;

  const product = {
    id: 'mpack_' + Date.now(),
    type: 'mpack',
    name: 'Underpacking Material',
    machine: machineSelect.options[machineSelect.selectedIndex].text,
    thickness: thicknessSelect.value + ' micron',
    size: sizeSelect.options[sizeSelect.selectedIndex].text,
    quantity: quantity,
    unit_price: parseFloat(unitPrice.toFixed(2)),
    discount_percent: discount,
    gst_percent: 12,
    image: 'images/mpack-placeholder.jpg',
    added_at: new Date().toISOString(),
    calculations: {
      unit_price: parseFloat(unitPrice.toFixed(2)),
      quantity: quantity,
      discounted_subtotal: parseFloat(priceAfterDiscount.toFixed(2)),
      discount_percent: discount,
      discount_amount: parseFloat(discountAmount.toFixed(2)),
      gst_percent: 12,
      gst_amount: parseFloat(gstAmount.toFixed(2)),
      final_total: parseFloat(finalPrice.toFixed(2))
    }
  };

  // Show loading state
  const addToCartBtn = event.target;
  const originalText = addToCartBtn.innerHTML;
  addToCartBtn.disabled = true;
  addToCartBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';

  fetch('/add_to_cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showToast('Success', 'Underpacking material added to cart!', 'success');
      updateCartCount();
    } else if (data.is_duplicate) {
      // Show confirmation dialog for duplicate product
      if (confirm('A similar MPack is already in your cart. Would you like to add it anyway?')) {
        // If user confirms, force add the product by removing the duplicate check
        fetch('/add_to_cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({...product, force_add: true})
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            showToast('Success', 'Underpacking material added to cart!', 'success');
            updateCartCount();
          } else {
            showToast('Error', data.error || 'Failed to add to cart', 'error');
          }
        })
        .catch(err => {
          console.error('Error adding to cart:', err);
          showToast('Error', 'Failed to add to cart. Please try again.', 'error');
        });
      }
    } else {
      showToast('Error', data.message || 'Failed to add to cart', 'error');
    }
  })
  .catch(error => {
    console.error('Error:', error);
    showToast('Error', 'Failed to add to cart', 'error');
  })
  .finally(() => {
    addToCartBtn.disabled = false;
    addToCartBtn.innerHTML = originalText;
  });
}
