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

   let companies = [];
   let selected = null;

   // Initialize company info from the page load
   function initCompanyInfo() {
       // These values are set in the template from session
       const companyName = nameDisplay.textContent.trim();
       const companyEmail = emailDisplay.textContent.trim();
       
       // If we have a company name but no email, try to find it in the companies list
       if (companyName && companyName !== 'Not selected' && !companyEmail) {
           const company = companies.find(c => c.name === companyName);
           if (company) {
               emailDisplay.textContent = company.email || '';
           }
       }
   }

   async function loadCompanies(){
      if (companies.length) return companies;
      try {
        const res = await fetch('/get_companies');
        companies = await res.json();
        initCompanyInfo(); // Initialize company info after loading companies
        return companies;
      } catch(err) {
        console.error('Load companies error:', err);
        return [];
      }  
   }

   // Event handlers
   changeBtn && changeBtn.addEventListener('click', async () => {
      await loadCompanies();
      bar.style.display = 'none';
      searchBox.style.display = 'block';
      searchResults.style.display = 'block';
      searchInput.focus();
   });

   cancelBtn && cancelBtn.addEventListener('click', ()=>{
     reset();
   });

   confirmBtn && confirmBtn.addEventListener('click', ()=>{
     if(!selected) return;
     updateCompany(selected);
   });

   // Debounced search input handler
   function debounce(fn, delay = 300) {
      let t;
      return (...args) => {
         clearTimeout(t);
         t = setTimeout(() => fn.apply(this, args), delay);
      };
   }

   searchInput && searchInput.addEventListener('input', debounce(e => {
      const term = e.target.value.trim().toLowerCase();

      if (!term) {
         searchResults.innerHTML = '';
         searchResults.style.display = 'none';
         confirmBtn.disabled = true;
         return;
      }

      // Filter companies
      const filtered = companies.filter(c => (c.name && c.name.toLowerCase().includes(term)) || (c.email && c.email.toLowerCase().includes(term)));

      // Sort relevance (startsWith first)
      filtered.sort((a, b) => {
         const aName = a.name.toLowerCase();
         const bName = b.name.toLowerCase();
         const aMatch = aName.startsWith(term) ? 0 : 1;
         const bMatch = bName.startsWith(term) ? 0 : 1;
         if (aMatch !== bMatch) return aMatch - bMatch;
         return aName.localeCompare(bName);
      });

      renderResults(filtered);
   }));

   function renderResults(list) {
      if (!list.length) {
         searchResults.innerHTML = '<div class="p-2 text-muted">No results found</div>';
         searchResults.style.display = 'block';
         return;
      }

      searchResults.innerHTML = list.map(c => `
         <div class="search-item p-2 border-bottom" data-id="${c.id}" data-name="${c.name}" data-email="${c.email || ''}">
            <div class="fw-bold">${c.name}</div>
            <div class="small text-muted">${c.email || ''}</div>
         </div>`).join('');
      searchResults.style.display = 'block';

      searchResults.querySelectorAll('.search-item').forEach(item => {
         item.addEventListener('click', () => {
            selected = { id: item.dataset.id, name: item.dataset.name, email: item.dataset.email };
            searchInput.value = selected.name;
            confirmBtn.disabled = false;
            searchResults.style.display = 'none';
         });
      });
   }

   async function updateCompany(company) {
      try {
        const response = await fetch('/update_company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: company.id,
            company_name: company.name,
            company_email: company.email
          })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
          // Update the display with the new company info
          nameDisplay.textContent = company.name || 'Not selected';
          emailDisplay.textContent = company.email || '';

          // Persist on client side for other pages (cart, etc.)
          if (window.sessionStorage) {
             sessionStorage.setItem('companyName', company.name || '');
             sessionStorage.setItem('companyEmail', company.email || '');
          }
          if (window.localStorage) {
             localStorage.setItem('selectedCompany', JSON.stringify({ name: company.name, email: company.email, id: company.id }));
          }
          
          // Show a success message (optional)
          showToast('Company updated successfully', 'success');
        } else {
          console.error('Update failed:', data.message || 'Unknown error');
          showToast(data.message || 'Failed to update company', 'error');
        }
      } catch (error) {
        console.error('Update error:', error);
        showToast('An error occurred while updating company', 'error');
      } finally {
        reset();
      }
   }
   
   // Helper function to show toast notifications
   function showToast(message, type = 'info') {
     const toast = document.createElement('div');
     toast.className = `toast show align-items-center text-white bg-${type === 'success' ? 'success' : 'danger'} border-0`;
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
     
     const toastContainer = document.getElementById('toastContainer') || (() => {
       const container = document.createElement('div');
       container.id = 'toastContainer';
       container.style.position = 'fixed';
       container.style.top = '1rem';
       container.style.right = '1rem';
       container.style.zIndex = '1100';
       document.body.appendChild(container);
       return container;
     })();
     
     toastContainer.appendChild(toast);
     
     // Auto-remove toast after 5 seconds
     setTimeout(() => {
       toast.classList.remove('show');
       setTimeout(() => {
         if (toast.parentNode === toastContainer) {
           toastContainer.removeChild(toast);
         }
       }, 300);
     }, 5000);
   }
 });
})();
