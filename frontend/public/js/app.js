// Main Application Module

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize authentication
  await initAuth();

  // Load conference count
  await loadConferenceCount();

  // Set up search form
  const searchForm = document.getElementById('search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', handleSearch);
  }


  // Set up search type change handler for placeholder updates
  document.querySelectorAll('input[name="search_type"]').forEach((radio) => {
    radio.addEventListener('change', updateSearchPlaceholder);
  });

  // Handle Enter key in search textarea
  // Handle Enter key in search textarea
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      // Check for Enter without modifiers (Shift/Ctrl)
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault(); // Stop a new line from being added to textarea
        
        const form = document.getElementById('search-form');
        if (form) {
          // This is the "Magic" line:
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit(); 
          } else {
            // Legacy fallback if you need to support very old browsers
            form.submit(); 
          }
        }
      }
    });
  }

  // PDF drop zone: extract first 300 chars and fill search box
  initSearchPdfDropzone();
});

const SEARCH_PDF_MAX_CHARS = 300;

async function parsePdfFirstx(file) {
  if (typeof pdfjsLib === 'undefined') return '';
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages && text.length < SEARCH_PDF_MAX_CHARS; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(' ') + '\n';
  }
  return text.slice(0, SEARCH_PDF_MAX_CHARS).trim();
}

function initSearchPdfDropzone() {
  const dropzone = document.getElementById('search-pdf-dropzone');
  const fileInput = document.getElementById('search-pdf-input');
  const searchInput = document.getElementById('searchInput');
  if (!dropzone || !fileInput || !searchInput) return;
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  function fillSearchFromFile(file) {
    if (!file || file.type !== 'application/pdf') return;
    const label = dropzone.querySelector('.search-pdf-label');
    if (label) label.textContent = 'Extracting text…';
    parsePdfFirstx(file).then((text) => {
      searchInput.value = text;
      if (label) label.textContent = 'Drag and drop a PDF or Word document here, or click to choose';
      fileInput.value = '';
    }).catch(() => {
      if (label) label.textContent = 'Drag and drop a PDF or Word document here, or click to choose';
      alert('Could not read PDF/Word document.');
      fileInput.value = '';
    });
  }

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) fillSearchFromFile(file);
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('search-pdf-dragover');
  });
  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('search-pdf-dragover');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('search-pdf-dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) fillSearchFromFile(file);
  });
}

/**
 * Load and display conference count
 */
async function loadConferenceCount() {
  try {
    // Importat line: Refers to the conferences/count.ts file in the functions folder
    const response = await fetch(`${window.API_BASE}/api/conferences/count`);
    const data = await response.json();

    const countElement = document.getElementById('record-count');
    if (countElement && data.ok) {
      countElement.textContent = data.count.toLocaleString();
    }
  } catch (error) {
    console.error('Failed to load conference count:', error);
  }
}

/**
 * Update search placeholder based on search type
 */
function updateSearchPlaceholder() {
  const searchInput = document.getElementById('searchInput');
  const searchType = document.querySelector('input[name="search_type"]:checked')?.value;

  if (!searchInput) return;

  const placeholders = {
    semantic: 'Search academic topics, research areas, methodologies...',
    lexical: 'Search by conference name, acronym, location...',
    hybrid: 'Search with both semantic understanding and keywords...',
  };

  searchInput.placeholder = placeholders[searchType] || placeholders.semantic;
}
