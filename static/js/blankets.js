let machineData = [], blanketData = [], barData = [], discountData = [], thicknessData = [];
let basePrice = 0, priceWithBar = 0, finalDiscountedPrice = 0;
let currentDiscount = 0;
let currentBarRate = 0;

window.onload = () => {
  fetch("/api/machines")
    .then(res => res.json())
    .then(data => {
      machineData = Array.isArray(data) ? data : data.machines;
      const select = document.getElementById("machineSelect");
      select.innerHTML = '<option value="">--Select Machine--</option>';
      machineData.forEach(machine => {
        const option = document.createElement("option");
        option.value = machine.id;
        option.text = machine.name;
        select.appendChild(option);
      });
      select.addEventListener("change", () => {
        document.getElementById("categorySection").style.display = 'block';
      });
    })
    .catch(error => {
      console.error('Error loading machine data:', error);
      alert('Error loading machine data. Please refresh the page to try again.');
    });
    
  // Load blanket categories
  fetch("/blanket_categories")
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      const categorySelect = document.getElementById("categorySelect");
      categorySelect.innerHTML = `
        <option value="" selected disabled>--select blanket categories--</option>
        <option value="All">All Categories</option>
      `;
      
      // Add each category to the dropdown
      Object.keys(data.categories).forEach(category => {
        if (category !== "All") {  // Skip the "All" category as it's already added
          const option = document.createElement("option");
          option.value = category;
          option.text = category;
          categorySelect.appendChild(option);
        }
      });
      
      // When category changes, filter the blankets
      categorySelect.addEventListener("change", () => {
        const selectedCategory = categorySelect.value;
        console.log('Category changed to:', selectedCategory);
        console.log('Available categories data:', data.categories);
        console.log('Current blanket data:', blanketData);
        filterBlanketsByCategory(selectedCategory, data.categories);
      });
      
      // Show the category section after loading
      document.getElementById("categorySection").style.display = 'block';
    })
    .catch(error => {
      console.error('Error loading blanket categories:', error);
      alert('Error loading blanket categories. Please refresh the page to try again.');
    });

  // Load blankets data
  console.log('Fetching blanket data...');
  fetch("/blanket_data")
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      console.log('Received blanket data:', data);
      blanketData = data.products || [];
      console.log('Processed blanket data:', blanketData);
      
      // Don't populate the blanket select yet, wait for category selection
      const blanketSelect = document.getElementById("blanketSelect");
      if (blanketSelect) {
        blanketSelect.innerHTML = '<option value="">-- Select a blanket type first --</option>';
        blanketSelect.disabled = true;
        console.log('Initialized blanket select with default state');
      } else {
        console.error('Blanket select element not found in DOM');
      }
    })
    .catch(error => {
      console.error('Error loading blanket data:', error);
      alert('Error loading blanket data. Please check console for details and refresh the page to try again.');
    });
    
  // Function to filter blankets by category
  function filterBlanketsByCategory(category, categories) {
    console.log('Filtering blankets for category:', category);
    
    if (!blanketData || !blanketData.length) {
      console.error('No blanket data available');
      return;
    }
    
    let filteredBlankets = [];
    
    if (category === "All") {
      console.log('Showing all blankets');
      filteredBlankets = [...blanketData];
    } else if (categories[category]) {
      console.log('Filtering by category:', category, 'IDs:', categories[category]);
      // Convert category IDs to numbers for comparison
      const categoryBlanketIds = categories[category].map(id => Number(id));
      filteredBlankets = blanketData.filter(blanket => {
        const match = categoryBlanketIds.includes(Number(blanket.id));
        console.log('Checking blanket:', blanket.id, 'Type:', typeof blanket.id, 'Match:', match);
        return match;
      });
    }
    
    console.log('Filtered blankets:', filteredBlankets);
    
    const blanketSelect = document.getElementById("blanketSelect");
    if (!blanketSelect) {
      console.error('Blanket select element not found');
      return;
    }
    
    // Clear and disable the select while updating
    blanketSelect.innerHTML = '<option value="">-- Select Blanket --</option>';
    blanketSelect.disabled = true;
    
    if (filteredBlankets.length === 0) {
      console.warn('No blankets found for the selected category');
      return;
    }
    
    // Add filtered blankets to the select
    filteredBlankets.forEach(blanket => {
      const option = new Option(blanket.name || `Blanket ${blanket.id}`, blanket.id);
      blanketSelect.add(option);
    });
    
    // Enable the select and set up change handler
    blanketSelect.disabled = false;
    blanketSelect.onchange = function() {
      console.log('Blanket selected:', this.value);
      displayRates();
      calculatePrice();
    };
    
    // Show the blanket section
    const blanketSection = document.getElementById("blanketSection");
    if (blanketSection) {
      blanketSection.style.display = 'block';
    }
    
    console.log('Blanket selection updated');
  }

  // Load thickness data
  function loadThicknessData() {
    fetch("/thickness_data")
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        // Handle both array and object response formats
        if (Array.isArray(data)) {
          thicknessData = data;
        } else if (data.thickness && Array.isArray(data.thickness)) {
          thicknessData = data.thickness;
        } else if (data.thicknesses && Array.isArray(data.thicknesses)) {
          thicknessData = data.thicknesses;
        } else {
          throw new Error('Invalid thickness data format');
        }

        const thicknessSelect = document.getElementById("thicknessSelect");
        if (!thicknessSelect) {
          console.error('Thickness select element not found');
          return;
        }

        thicknessSelect.innerHTML = '<option value="">-- Select Thickness --</option>';
        
        thicknessData.forEach(t => {
          const opt = document.createElement("option");
          // Handle both object and primitive values
          if (typeof t === 'object' && t !== null) {
            opt.value = t.value || t.id || JSON.stringify(t);
            opt.text = t.label || t.name || t.value || JSON.stringify(t);
          } else {
            opt.value = t;
            opt.text = t;
          }
          thicknessSelect.appendChild(opt);
        });
        
        // Add change event listener for thickness select
        thicknessSelect.addEventListener("change", () => {
          console.log('Thickness changed, recalculating price...');
          calculatePrice();
        });
      })
      .catch(error => {
        console.error('Error loading thickness data:', error);
        // Fallback to default thickness options if the request fails
        const defaultThicknesses = [
          { value: '0.5', label: '0.5mm' },
          { value: '1.0', label: '1.0mm' },
          { value: '1.5', label: '1.5mm' },
          { value: '2.0', label: '2.0mm' },
          { value: '3.0', label: '3.0mm' }
        ];
        
        const thicknessSelect = document.getElementById("thicknessSelect");
        if (thicknessSelect) {
          thicknessSelect.innerHTML = '<option value="">-- Select Thickness --</option>';
          defaultThicknesses.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t.value;
            opt.text = t.label;
            thicknessSelect.appendChild(opt);
          });
        }
      });
  }

  // Initialize thickness data loading
  loadThicknessData();

  // Load bar data
  fetch("/bar_data")
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      barData = data.bars || [];
      const barSelect = document.getElementById("barSelect");
      barSelect.innerHTML = '<option value="">--Select--</option>';
      barData.forEach(bar => {
        const opt = document.createElement("option");
        opt.value = bar.barRate;
        opt.text = bar.bar;
        barSelect.appendChild(opt);
      });

      barSelect.onchange = () => {
        currentBarRate = parseFloat(barSelect.value || 0);
        const barRateElement = document.getElementById("barRate");
        if (barRateElement) {
          barRateElement.innerText = `Barring Price/pc: ₹${currentBarRate.toFixed(2)}`;
        }
        calculatePrice();
      };
    });

  // Load discounts from discount.json
  function loadDiscounts() {
    fetch("/static/data/discount.json")
      .then(res => res.json())
      .then(data => {
        const select = document.getElementById("discountSelect");
        select.innerHTML = '<option value="">-- Select Discount --</option>';
        
        // Sort discounts in descending order
        const sortedDiscounts = [...data.discounts].sort((a, b) => parseFloat(b) - parseFloat(a));
        
        sortedDiscounts.forEach(discount => {
          const option = document.createElement("option");
          const discountValue = parseFloat(discount);
          option.value = discountValue;
          option.text = `${discountValue.toFixed(2)}%`;
          select.appendChild(option);
        });
        
        // Add event listener for discount changes
        select.addEventListener('change', () => {
          currentDiscount = parseFloat(select.value) || 0;
          calculatePrice();
        });
      })
      .catch(error => {
        console.error('Error loading discounts:', error);
        // Fallback to default discounts if loading fails
        const defaultDiscounts = ["5.00", "10.00", "15.00", "20.00"];
        const select = document.getElementById("discountSelect");
        select.innerHTML = '<option value="">-- Select Discount --</option>';
        defaultDiscounts.forEach(discount => {
          const option = document.createElement("option");
          const discountValue = parseFloat(discount);
          option.value = discountValue;
          option.text = `${discountValue.toFixed(2)}%`;
          select.appendChild(option);
        });
      });
  }

  // Call loadDiscounts when the page loads
  loadDiscounts();

  fetch("/static/data/thickness.json")
    .then(res => res.json())
    .then(data => {
      thicknessData = data.thicknesses || [];
      const select = document.getElementById("thicknessSelect");
      if (select) {
        select.innerHTML = '<option value="">-- Select Thickness --</option>';
        thicknessData.forEach(th => {
          const opt = document.createElement("option");
          opt.value = th.value;
          opt.textContent = th.label;
          select.appendChild(opt);
        });
        // Add change event to recalculate price when thickness changes
        select.addEventListener('change', calculatePrice);
      }
    })
    .catch(error => {
      console.error('Error loading thickness data:', error);
    });

  // Function to filter blankets by category
  function filterBlanketsByCategory(category, categories) {
    if (!blanketData || !blanketData.length) return;
    
    let filteredBlankets = [];
    
    if (category === "All") {
      filteredBlankets = [...blanketData];
    } else {
      const categoryBlanketIds = categories[category] || [];
      filteredBlankets = blanketData.filter(blanket => 
        categoryBlanketIds.includes(blanket.id)
      );
    }
    
    populateBlanketSelect(filteredBlankets);
    document.getElementById("blanketSection").style.display = 'block';
  }
  
  // Function to populate blanket select dropdown
  function populateBlanketSelect(blankets) {
    const blanketSelect = document.getElementById("blanketSelect");
    blanketSelect.innerHTML = '<option value="">--Select Blanket--</option>';
    
    blankets.forEach(blanket => {
      const opt = document.createElement("option");
      opt.value = blanket.id;
      opt.text = blanket.name;
      blanketSelect.appendChild(opt);
    });
    
    // Reset any previous event listeners and add new one
    const newSelect = blanketSelect.cloneNode(true);
    blanketSelect.parentNode.replaceChild(newSelect, blanketSelect);
    
    newSelect.addEventListener("change", () => {
      displayRates();
      calculatePrice();
    });
  }

  // Debug: Log when script loads
  console.log('Blankets script loaded');

  // Add event listeners for automatic updates
  const inputs = [
    { id: "lengthInput", type: "input" },
    { id: "widthInput", type: "input" },
    { id: "unitSelect", type: "change" },
    { id: "thicknessSelect", type: "change" },
    { id: "quantityInput", type: "input" },
    { id: "barSelect", type: "change" },
    { id: "gstSelect", type: "change" },
    { id: "discountSelect", type: "change" }
  ];
  
  inputs.forEach(({id, type}) => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener(type, (e) => {
        console.log(`${id} ${type} event triggered`);
        calculatePrice();
      });
    } else {
      console.warn(`Element with id '${id}' not found`);
    }
  });

  // Call calculatePrice when the page loads to initialize values
  calculatePrice();
  
  // Initialize discount section
  function updateDiscountSection() {
    const discountSection = document.getElementById('discountSection');
    const discountSelect = document.getElementById('discountSelect');
    
    if (!discountSection || !discountSelect) {
      console.error('Discount section or select element not found');
      return;
    }
  }
  
  // Hook add-to-cart button
  const addBtn = document.getElementById("addToCartBlanket");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      if (!selectedBlanket) return;
      const cart = JSON.parse(localStorage.getItem("cart") || "[]");
      cart.push({
        type: "blanket",
        blanketId: selectedBlanket.id,
        name: selectedBlanket.name,
        lengthM: lengthM,
        widthM: widthM,
        quantity: quantity,
        unitPrice: priceWithBar,
        subtotal: priceWithBar * quantity
      });
      localStorage.setItem("cart", JSON.stringify(cart));
      if (typeof updateCartCount === "function") updateCartCount();
      alert("Added to cart");
    });
  }

  // Initialize discount section
  updateDiscountSection();
  
  // Initial calculation
  calculatePrice();
};

function convertToMeters(value, unit) {
  if (!value) {
    console.log('convertToMeters: No value provided, returning 0');
    return 0;
  }
  
  console.log(`convertToMeters: Converting ${value} ${unit} to meters`);
  
  let result;
  switch(unit) {
    case "mm": 
      result = value / 1000;
      break;
    case "m": 
      result = value;
      break;
    case "in": 
      result = value * 0.0254;
      break;
    default: 
      console.warn(`convertToMeters: Unknown unit '${unit}', returning value as is`);
      result = value;
  }
  
  console.log(`convertToMeters: ${value} ${unit} = ${result} meters`);
  return result;
}

function displayRates() {
  const selected = blanketData.find(p => p.id == document.getElementById("blanketSelect").value);
  if (selected) {
    const ratePerSqMeter = parseFloat(selected.ratePerSqMt || selected.base_rate || 0);
    document.getElementById("rateSqMeter").innerText = `₹${ratePerSqMeter}`;
    // 1 sq.m = 1.19599 sq.yd, derive yard rate on the fly if not provided
    const ratePerSqYard = parseFloat(selected.ratePerSqYard || (ratePerSqMeter ? (ratePerSqMeter / 1.19599).toFixed(2) : 0));
    document.getElementById("rateSqYard").innerText = `₹${ratePerSqYard}`;
    
  } else {
    document.getElementById("rateSqMeter").innerText = '-';
    document.getElementById("rateSqYard").innerText = '-';
  }
}

function calculatePrice() {
  console.log('calculatePrice called');
  
  // Get input values with fallbacks
  const length = parseFloat(document.getElementById("lengthInput")?.value) || 0;
  const width = parseFloat(document.getElementById("widthInput")?.value) || 0;
  const unit = document.getElementById("unitSelect")?.value || 'mm';
  const thickness = document.getElementById("thicknessSelect")?.value || '';
  const quantity = parseInt(document.getElementById("quantityInput")?.value) || 1;
  const blanketSelect = document.getElementById("blanketSelect");
  
  console.log('Input values:', { length, width, unit, thickness, quantity });
  
  if (!blanketSelect?.value) {
    console.log('No blanket selected');
    return;
  }
  
  // Convert string ID to number for comparison
  const selectedBlanket = blanketData.find(b => b.id.toString() === blanketSelect.value.toString());
  
  if (!selectedBlanket) {
    console.log('Selected blanket not found in data');
    return;
  }
  
  console.log('Selected blanket:', selectedBlanket);
  
  try {
    // Convert dimensions to meters
    const lengthM = convertToMeters(length, unit);
    const widthM = convertToMeters(width, unit);
    const areaSqM = lengthM * widthM;
    const areaSqYard = areaSqM * 1.19599; // 1 sq.m = 1.19599 sq.yd
    
    // Update area display
    const areaElement = document.getElementById("calculatedArea");
    if (areaElement) {
      areaElement.innerText = `Area per unit: ${areaSqM.toFixed(4)} m² (${areaSqYard.toFixed(4)} yd²)`;
    }
    
    // Calculate base price (area × rate per sq.m)
    const ratePerSqMt = parseFloat(selectedBlanket.ratePerSqMt || selectedBlanket.base_rate || 0);
    basePrice = areaSqM * ratePerSqMt;
    
    // Calculate net price per piece (base price + barring)
    const netPricePerPiece = basePrice + currentBarRate;
    
    // Get quantity
    const quantity = parseInt(document.getElementById('quantityInput').value) || 1;
    
    // Calculate base total (net price × quantity)
    const baseTotal = netPricePerPiece * quantity;
    
    // Update UI - Show base price and net price/pc
    document.getElementById('basePrice').textContent = `Base Price: ₹${basePrice.toFixed(2)}`;
    document.getElementById('netUnitPrice').textContent = `Net Price/PC: ₹${netPricePerPiece.toFixed(2)}`;
    
    // Get discount percentage from select
    const discountSelect = document.getElementById('discountSelect');
    currentDiscount = parseFloat(discountSelect.value) || 0;
    
    // Calculate discount amount and discounted total
    let discountAmount = 0;
    let discountedTotal = baseTotal;
    const discountValue = document.getElementById('discountedValue');
    
    if (currentDiscount > 0) {
      discountAmount = (baseTotal * currentDiscount) / 100;
      discountedTotal = baseTotal - discountAmount;
      
      // Update discount display
      if (discountValue) {
        discountValue.textContent = `Discount (${currentDiscount}%): -₹${discountAmount.toFixed(2)}`;
        discountValue.style.display = 'block';
      }
    } else {
      // Hide discount display if no discount
      if (discountValue) {
        discountValue.style.display = 'none';
      }
    }
    
    // Apply GST on the discounted total
    const gstRate = parseFloat(document.getElementById('gstSelect').value) || 0;
    const gstAmount = (discountedTotal * gstRate) / 100;
    const totalPrice = discountedTotal + gstAmount;
    
    // Update price summary
    const finalPriceElement = document.getElementById('finalPrice');
    if (finalPriceElement) {
      const selectedBar = document.getElementById('barSelect').options[document.getElementById('barSelect').selectedIndex]?.text || 'None';
      const pricePerUnit = basePrice + currentBarRate;
      const netPrice = pricePerUnit * quantity;
      
      let summaryHTML = `
        <div class="d-flex justify-content-between mb-2">
          <span>Unit Price:</span>
          <span>₹${basePrice.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between mb-2">
          <span>Barring (${selectedBar}):</span>
          <span>₹${currentBarRate.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between mb-2">
          <span>Price per Unit:</span>
          <span>₹${pricePerUnit.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between mb-2">
          <span>Quantity:</span>
          <span>${quantity}</span>
        </div>
        <div class="d-flex justify-content-between mb-2 fw-bold">
          <span>Net Price:</span>
          <span>₹${netPrice.toFixed(2)}</span>
        </div>`;
      
      if (currentDiscount > 0) {
        summaryHTML += `
        <div class="d-flex justify-content-between text-danger mb-2">
          <span>Discount (${currentDiscount}%):</span>
          <span>-₹${discountAmount.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between mb-2 fw-bold">
          <span>Discounted Price:</span>
          <span>₹${discountedTotal.toFixed(2)}</span>
        </div>`;
      }
      
      summaryHTML += `
        <div class="d-flex justify-content-between mb-2">
          <span>GST (${gstRate}%):</span>
          <span>₹${gstAmount.toFixed(2)}</span>
        </div>
        <hr>
        <div class="d-flex justify-content-between fw-bold fs-5">
          <span>Sum Total:</span>
          <span>₹${totalPrice.toFixed(2)}</span>
        </div>`;
      
      finalPriceElement.innerHTML = summaryHTML;
    }
    
  } catch (error) {
    console.error('Error in calculatePrice:', error);
  }
}



function applyDiscount() {
  const discountSelect = document.getElementById("discountSelect");
  const discountVal = discountSelect.value;
  const discountedValueElement = document.getElementById("discountedValue");
  
  if (discountVal) {
    const discount = parseFloat(discountVal.replace('%', '')) || 0;
    currentDiscount = discount;
    const discountAmount = (priceWithBar * discount) / 100;
    finalDiscountedPrice = priceWithBar - discountAmount;
    
    // Show discounted value per unit
    if (discountedValueElement) {
      discountedValueElement.style.display = 'block';
      discountedValueElement.textContent = `Discounted value/unit: ₹${discountAmount.toFixed(2)}`;
    }
  } else {
    currentDiscount = 0;
    finalDiscountedPrice = priceWithBar;
    // Hide discounted value display when no discount is selected
    if (discountedValueElement) {
      discountedValueElement.style.display = 'none';
    }
  }
}

function applyGST() {
  const quantity = parseInt(document.getElementById("quantityInput").value) || 0;
  if (quantity === 0) return;

  const gstRate = parseFloat(document.getElementById("gstSelect").value) || 0;
  const totalBeforeDiscount = priceWithBar * quantity;
  const discountAmount = (totalBeforeDiscount * currentDiscount) / 100;
  const totalAfterDiscount = totalBeforeDiscount - discountAmount;
  const gstAmount = (totalAfterDiscount * gstRate) / 100;
  const finalPrice = totalAfterDiscount + gstAmount;

  const finalPriceElement = document.getElementById("finalPrice");
  if (finalPriceElement) {
    finalPriceElement.innerHTML = `
      <div class="price-breakdown">
        <div class="d-flex justify-content-between">
          <span>Subtotal (${quantity} units):</span>
          <span>₹${totalBeforeDiscount.toFixed(2)}</span>
        </div>
        ${currentDiscount > 0 ? `
        <div class="d-flex justify-content-between text-danger">
          <span>Discount (${currentDiscount}%):</span>
          <span>-₹${discountAmount.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between">
          <span>After Discount:</span>
          <span>₹${totalAfterDiscount.toFixed(2)}</span>
        </div>` : ''}
        <div class="d-flex justify-content-between">
          <span>GST (${gstRate}%):</span>
          <span>+₹${gstAmount.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between fw-bold mt-2 pt-2 border-top">
          <span>Final Amount:</span>
          <span>₹${finalPrice.toFixed(2)}</span>
        </div>
      </div>
    `;
  }
}

// Attach auto-calc listeners for dimension and other inputs
  const lengthInput = document.getElementById('lengthInput');
  const widthInput = document.getElementById('widthInput');
  const quantityInput = document.getElementById('quantityInput');
  const unitSelect = document.getElementById('unitSelect');
  const gstSelect = document.getElementById('gstSelect');

  [lengthInput, widthInput, quantityInput].forEach(el => {
    if (el) {
      el.addEventListener('input', () => {
        calculatePrice();
      });
    }
  });
  if (unitSelect) unitSelect.addEventListener('change', calculatePrice);
  if (gstSelect) gstSelect.addEventListener('change', () => {
    applyGST();
    calculatePrice();
  });

// Initialize discount select when the page loads
document.addEventListener('DOMContentLoaded', function() {
  // Add event listener for discount select
  const discountSelect = document.getElementById('discountSelect');
  if (discountSelect) {
    discountSelect.addEventListener('change', function() {
      currentDiscount = parseFloat(this.value) || 0;
      calculatePrice();
    });
    
    // Load discount options
    fetch('/static/data/discount.json')
      .then(res => res.json())
      .then(data => {
        discountSelect.innerHTML = '<option value="">-- Select Discount --</option>';
        data.discounts.forEach(discountStr => {
          const percent = parseFloat(discountStr);
          const opt = document.createElement('option');
          opt.value = percent;
          opt.textContent = discountStr;
          discountSelect.appendChild(opt);
        });
      });
  }
});

function addBlanketToCart() {
  // Get input elements
  const blanketSelect = document.getElementById('blanketSelect');
  const machineSelect = document.getElementById('machineSelect');
  const thicknessSelect = document.getElementById('thicknessSelect');
  const lengthInput = document.getElementById('lengthInput');
  const widthInput = document.getElementById('widthInput');
  const quantityInput = document.getElementById('quantityInput');
  const barSelect = document.getElementById('barSelect');
  const gstSelect = document.getElementById('gstSelect');
  
  // Get input values
  const quantity = parseInt(quantityInput.value) || 1;
  const length = parseFloat(lengthInput.value) || 0;
  const width = parseFloat(widthInput.value) || 0;
  const unit = document.getElementById('unitSelect').value || 'mm';
  const gstPercent = parseFloat(gstSelect.value) || 0;
  
  // Get selected blanket - ensure string comparison for ID matching
  const selectedBlanketId = blanketSelect.value;
  const selectedBlanket = blanketData.find(b => b.id.toString() === selectedBlanketId.toString());
  
  if (!selectedBlanket) {
    showToast('Error', 'Please select a valid blanket', 'error');
    return;
  }
  
  // Get barring information
  const selectedBar = barData.find(b => b.bar === barSelect.options[barSelect.selectedIndex]?.text);
  const barType = selectedBar ? selectedBar.bar : 'None';
  const barPrice = selectedBar ? parseFloat(selectedBar.barRate || selectedBar.price || 0) : 0;
  
  console.log('Bar info:', { selectedBar, barType, barPrice });
  
  // Convert dimensions to meters for calculation
  const lengthM = convertToMeters(length, unit);
  const widthM = convertToMeters(width, unit);
  const areaSqM = lengthM * widthM;
  
  // Calculate base price (area * rate per sq.meter)
  // Prefer ratePerSqMt, fallback to base_rate for backward compatibility
  const ratePerSqMt = parseFloat(selectedBlanket.ratePerSqMt || selectedBlanket.base_rate || 0);
  basePrice = areaSqM * ratePerSqMt;
  
  // Apply discount to base price only
  const discountAmount = currentDiscount > 0 ? (basePrice * currentDiscount / 100) : 0;
  const discountedBasePrice = basePrice - discountAmount;
  
  // Add bar price after discount - multiply bar rate by area in square meters
  const priceWithBar = discountedBasePrice + (barPrice * areaSqM);
  const discountedPrice = priceWithBar;
  
  // Calculate GST on the discounted price
  const gstAmount = (discountedPrice * gstPercent) / 100;
  const finalUnitPrice = discountedPrice + gstAmount;
  const finalTotalPrice = finalUnitPrice * quantity;

  // Create product object with all calculated values
  const product = {
    id: 'blanket_' + Date.now(),
    type: 'blanket',
    name: selectedBlanket.name || 'Custom Blanket',
    blanket_name: selectedBlanket.name || 'Custom Blanket',
    machine: machineSelect.options[machineSelect.selectedIndex].text,
    thickness: thicknessSelect ? thicknessSelect.value : '',
    length: length,
    width: width,
    unit: unit,
    bar_type: barType,
    bar_price: barPrice,
    quantity: quantity,
    gst_percent: gstPercent,
    
    // Price calculations
    base_price: parseFloat(basePrice.toFixed(2)),
    bar_price: barPrice,
    discount_percent: currentDiscount,
    gst_percent: gstPercent,
    
    // Pre-calculated values for display
    calculations: {
      areaSqM: parseFloat(areaSqM.toFixed(4)),
      ratePerSqMt: parseFloat(selectedBlanket.base_rate) || 0,
      basePrice: parseFloat(basePrice.toFixed(2)),
      pricePerUnit: parseFloat(priceWithBar.toFixed(2)),
      subtotal: parseFloat((priceWithBar * quantity).toFixed(2)),
      discount_percent: currentDiscount,
      discount_amount: parseFloat(discountAmount.toFixed(2)),
      discounted_subtotal: parseFloat((discountedPrice * quantity).toFixed(2)),
      gst_percent: gstPercent,
      gst_amount: parseFloat((gstAmount * quantity).toFixed(2)),
      final_price: parseFloat(finalTotalPrice.toFixed(2))
    },
    
    // For backward compatibility
    unit_price: parseFloat(finalUnitPrice.toFixed(2)),
    total_price: parseFloat(finalTotalPrice.toFixed(2)),
    
    // Other
    image: 'images/products/blanket-placeholder.jpg',
    added_at: new Date().toISOString()
  };
  
  console.log('Adding to cart with pre-calculated values:', JSON.stringify({
    ...product,
    // Don't log the entire calculations object to keep console clean
    calculations: { ...product.calculations, barPrice: product.calculations.barPrice }
  }, null, 2));

  // Initialize cart as array if it doesn't exist
  let cart = JSON.parse(localStorage.getItem('cart'));
  if (!cart || !Array.isArray(cart)) {
    cart = [];
  }
  
  // Add product to cart
  cart.push(product);
  
  // Save updated cart
  localStorage.setItem('cart', JSON.stringify(cart));

  // --- NEW: persist to server cart as well ---
  try {
    const payload = {
      type: 'blanket',
      name: product.name,
      machine: product.machine,
      thickness: product.thickness,
      length: product.length,
      width: product.width,
      unit: product.unit,
      bar_type: product.bar_type,
      bar_price: product.bar_price,
      quantity: product.quantity,
      base_price: product.base_price,
      discount_percent: product.discount_percent,
      gst_percent: product.gst_percent,
      unit_price: product.unit_price,
      total_price: product.total_price,
      calculations: product.calculations
    };

    fetch('/add_to_cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (data.success) {
          showToast('Success', 'Blanket added to cart!', 'success');
          if (typeof updateCartCount === 'function') {
            updateCartCount();
          }
        } else if (data.is_duplicate) {
          // Show confirmation dialog for duplicate product
          if (confirm('A product with the same dimensions is already in your cart. Would you like to add it anyway?')) {
            // If user confirms, force add the product by removing the duplicate check
            fetch('/add_to_cart', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({...payload, force_add: true})
            })
            .then(res => res.json())
            .then(data => {
              if (data.success) {
                showToast('Success', 'Blanket added to cart!', 'success');
                if (typeof updateCartCount === 'function') {
                  updateCartCount();
                }
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
          showToast('Error', data.error || 'Failed to add to cart', 'error');
          throw new Error(data.error || 'Failed to add to cart');
        }
      })
      .catch(err => {
        console.error('Error adding to cart:', err);
        showToast('Error', 'Failed to add to cart. Please try again.', 'error');
      });
  } catch (e) {
    console.error('Unexpected error:', e);
    showToast('Error', 'Failed to add to cart. Please try again.', 'error');
  }

  showToast('Success', 'Blanket added to cart!', 'success');
  if (typeof updateCartCount === 'function') updateCartCount();
}
