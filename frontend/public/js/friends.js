document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();

  const loginRequired = document.getElementById('login-required');
  const searchSection = document.getElementById('search-section');
  const resultsContainer = document.getElementById('results-container');
  const userRecommendationBtn = document.getElementById('user-recommendation');

  if (!window.currentUser) {
    loginRequired.style.display = 'block';
    document.getElementById('login-prompt-btn').addEventListener('click', () => login());
    return;
  }

  searchSection.style.display = 'block';

  const searchInput = document.getElementById('friends-search-input');
  const searchForm = document.getElementById('search-form');
  let debounceTimer = null;
  const DEBOUNCE_MS = 300;

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function doSearch() {
    const q = searchInput.value.trim();
    if (q.length < 2) {
      resultsContainer.innerHTML = '<p class="text-muted">Type at least 2 characters to search.</p>';
      return;
    }
    resultsContainer.innerHTML = '<p class="text-muted">Searching...</p>';
    try {
      const token = await getAuthToken();
      const res = await fetch(`${window.API_BASE || ''}/api/friends/search?q=${encodeURIComponent(q)}`, {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await res.json();
      if (!data.ok || !data.users) {
        resultsContainer.innerHTML = '<p class="text-muted">No results.</p>';
        return;
      }
      if (data.users.length === 0) {
        resultsContainer.innerHTML = '<p class="text-muted">No matching profiles.</p>';
        return;
      }
      resultsContainer.innerHTML = '<div class="list-group">' + data.users.map((u) => {
        const emailPart = u.email ? `<div class="small text-muted">${escapeHtml(u.email)}</div>` : '';
        return `<a href="/profile.html?slug=${encodeURIComponent(u.slug)}" class="list-group-item list-group-item-action"><div>${escapeHtml(u.name)}</div>${emailPart}</a>`;
      }).join('') + '</div>';
    } catch (e) {
      resultsContainer.innerHTML = '<p class="text-danger">Search failed. Try again.</p>';
    }
  }

  async function searchForUsers() {
    console.log('Fetching user recommendations...');
    resultsContainer.innerHTML = '<p class="text-muted">Loading recommendations...</p>';
    try {
      const token = await getAuthToken();
      const res = await fetch(`${window.API_BASE || ''}/api/friends/recomendation`, {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await res.json();
      if (!data.ok || !data.users || data.users.length === 0) {
        resultsContainer.innerHTML = '<p class="text-muted">No similar researchers found. Complete your profile to get recommendations.</p>';
        return;
      }
      resultsContainer.innerHTML = '<div class="list-group">' + data.users.map((u) => {
        return `<a href="/profile.html?slug=${encodeURIComponent(u.slug)}" class="list-group-item list-group-item-action"><div>${escapeHtml(u.name)}</div><div class="small text-muted">${escapeHtml(u.email || '')}</div></a>`;
      }).join('') + '</div>';
    } catch (e) {
      resultsContainer.innerHTML = '<p class="text-danger">Failed to load recommendations. Try again.</p>';
    }
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = searchInput.value.trim();
    if (q.length < 2) {
      resultsContainer.innerHTML = '';
      return;
    }
    debounceTimer = setTimeout(doSearch, DEBOUNCE_MS);
  });

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(debounceTimer);
    debounceTimer = null;
    doSearch();
  });

  userRecommendationBtn.addEventListener('click', async () => {
    userRecommendationBtn.disabled = true;
    userRecommendationBtn.textContent = 'Loading...';
    await searchForUsers();
    userRecommendationBtn.disabled = false;
    userRecommendationBtn.textContent = 'Find Similar Researchers';
  });
});
