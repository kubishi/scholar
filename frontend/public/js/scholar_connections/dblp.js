const connectDBLPButton = document.getElementById('connect-dblp-btn');
const dblpModal = document.getElementById('dblp-modal');
const cancelDBLPButton = document.getElementById('cancel-dblp-btn');
const saveDBLPButton = document.getElementById('save-dblp-btn');
const dblpNameInput = document.getElementById('dblp-name');
const dblpDropdown = document.getElementById('dblp-dropdown');
const dblpInputWrap = document.querySelector('.dblp-input-wrap');

let dblpDebounceTimer = null;
let selectedDblpAuthor = null;

function positionDropdownToPage() {
  if (!dblpDropdown || !dblpNameInput) return;
  const rect = dblpNameInput.getBoundingClientRect();
  dblpDropdown.style.position = 'fixed';
  dblpDropdown.style.top = (rect.bottom + 2) + 'px';
  dblpDropdown.style.left = rect.left + 'px';
  dblpDropdown.style.width = rect.width + 'px';
  dblpDropdown.style.zIndex = '1060';
}

function showDblpDropdown(authors) {
  if (!dblpDropdown) return;
  dblpDropdown.innerHTML = '';
  if (!authors || authors.length === 0) {
    hideDblpDropdown();
    return;
  }
  authors.forEach((author) => {
    const item = document.createElement('div');
    item.className = 'dblp-dropdown-item';
    item.setAttribute('role', 'option');
    item.textContent = author.name;
    if (author.url) item.title = author.url;
    item.addEventListener('click', () => {
      if (dblpNameInput) dblpNameInput.value = author.name;
      selectedDblpAuthor = author;
      hideDblpDropdown();
    });
    dblpDropdown.appendChild(item);
  });
  if (document.body !== dblpDropdown.parentElement) {
    document.body.appendChild(dblpDropdown);
  }
  positionDropdownToPage();
  dblpDropdown.classList.add('open');
}

function hideDblpDropdown() {
  if (!dblpDropdown) return;
  dblpDropdown.classList.remove('open');
  dblpDropdown.innerHTML = '';
  dblpDropdown.removeAttribute('style');
  if (dblpInputWrap && dblpDropdown.parentElement === document.body) {
    dblpInputWrap.appendChild(dblpDropdown);
  }
}

if (connectDBLPButton) {
  connectDBLPButton.addEventListener('click', () => {
    if (dblpModal) dblpModal.style.display = 'flex';
    if (dblpNameInput) dblpNameInput.value = '';
    selectedDblpAuthor = null;
    hideDblpDropdown();
  });
}

if (cancelDBLPButton && dblpModal) {
  cancelDBLPButton.addEventListener('click', () => {
    dblpModal.style.display = 'none';
    hideDblpDropdown();
  });
}

if (dblpNameInput && dblpDropdown) {
  dblpNameInput.addEventListener('input', () => {
    selectedDblpAuthor = null;
    const q = dblpNameInput.value.trim();
    clearTimeout(dblpDebounceTimer);
    if (q.length < 2) {
      hideDblpDropdown();
      return;
    }
    dblpDebounceTimer = setTimeout(async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch(`${window.API_BASE || ''}/api/scholar_api/dblp_api_users?name=${encodeURIComponent(q)}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok && data.authors) showDblpDropdown(data.authors);
        else hideDblpDropdown();
      } catch (e) {
        hideDblpDropdown();
      }
    }, 250);
  });
  dblpNameInput.addEventListener('blur', () => {
    setTimeout(hideDblpDropdown, 150);
  });
}

document.addEventListener('click', (e) => {
  if (dblpDropdown && dblpDropdown.classList.contains('open') &&
      !e.target.closest('.dblp-input-wrap') && !e.target.closest('#dblp-dropdown')) {
    hideDblpDropdown();
  }
});

if (saveDBLPButton && dblpNameInput && dblpModal) {
  saveDBLPButton.addEventListener('click', async () => {
    const name = dblpNameInput.value.trim();
    if (!name) {
      alert('Please enter your name or pick a profile from the list.');
      return;
    }
    const token = await getAuthToken();
    const res = await fetch(`${window.API_BASE || ''}/api/scholar_api/dblp_api_papers?name=${encodeURIComponent(name)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    saveDBLPButton.disabled = true;
    try {
      if (!res.ok) {
        alert('Failed to connect DBLP profile.');
        return;
      }
      const data = await res.json();
      console.log("dblp_api_papers", data, "<- data");
      if (data.ok && data.papers) {
        
        alert(selectedDblpAuthor ? 'DBLP profile selected.' : 'Search completed.');
      }
    } finally {
      saveDBLPButton.disabled = false;
    }
  });
}

















