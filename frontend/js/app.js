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
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        const form = document.getElementById('search-form');
        if (form) form.dispatchEvent(new Event('submit'));
      }
    });
  }
});

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
