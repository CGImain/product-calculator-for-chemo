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

   async function loadCompanies(){
      if (companies.length) return;
      try{
        const res = await fetch('/get_companies');
        companies = await res.json();
      }catch(err){console.error('Load companies', err);}  
   }

   // Event handlers
   changeBtn && changeBtn.addEventListener('click', async ()=>{
     await loadCompanies();
     bar.style.display='none';
     searchBox.style.display='block';
     searchInput.focus();
   });

   cancelBtn && cancelBtn.addEventListener('click', ()=>{
     reset();
   });

   confirmBtn && confirmBtn.addEventListener('click', ()=>{
     if(!selected) return;
     updateCompany(selected);
   });

   searchInput && searchInput.addEventListener('input', e=>{
     const term = e.target.value.toLowerCase();
     const filtered = companies.filter(c=> (c.name && c.name.toLowerCase().includes(term)) || (c.email && c.email.toLowerCase().includes(term)));
     renderResults(filtered);
   });

   function renderResults(list){
     searchResults.innerHTML = list.map(c=>`<div class="search-item" data-id="${c.id}" data-name="${c.name}" data-email="${c.email||''}">${c.name}${c.email?`<br><small class='text-muted'>${c.email}</small>`:''}</div>`).join('');
     searchResults.querySelectorAll('.search-item').forEach(item=>{
        item.addEventListener('click', ()=>{
          selected = {id:item.dataset.id,name:item.dataset.name,email:item.dataset.email};
          searchInput.value = selected.name;
          confirmBtn.disabled = false;
        });
     });
   }

   function reset(){
      bar.style.display='flex';
      searchBox.style.display='none';
      searchInput.value='';
      searchResults.innerHTML='';
      confirmBtn.disabled=true;
      selected=null;
   }

   function updateCompany(c){
      fetch('/update_company',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({company_id:c.id,company_name:c.name,company_email:c.email})
      }).then(r=>r.json()).then(d=>{
        if(d.status==='success'){
          nameDisplay.textContent=c.name||'Not provided';
          emailDisplay.textContent=c.email||'';
        }
        reset();
      }).catch(err=>{console.error('update',err);reset();});
   }
 });
})();
