// Search Module

/**
 * Handle search form submission
 */
async function handleSearch(event) {
  event.preventDefault();

  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;

  const searchType = document.querySelector('input[name="search_type"]:checked')?.value || 'semantic';
  const numResults = document.getElementById('num-results')?.value || '10';
  const location = document.getElementById('location')?.value || '';
  const dateFirst = document.getElementById('date-span-first')?.value || '';
  const dateSecond = document.getElementById('date-span-second')?.value || '';
  const deadlineFirst = document.getElementById('deadline-first')?.value || '';
  const deadlineSecond = document.getElementById('deadline-second')?.value || '';
  const rankingSource = document.getElementById('ranking-source')?.value || '';
  const rankingScoreInput = document.querySelector('#ranking-score-container input, #ranking-score-container select');
  const rankingScore = rankingScoreInput?.value || '';

  // Build query params
  const params = new URLSearchParams({
    query,
    search_type: searchType,
    num_results: numResults,
  });

  if (location) params.append('location', location);
  if (dateFirst) params.append('date_span_first', dateFirst);
  if (dateSecond) params.append('date_span_second', dateSecond);
  if (deadlineFirst) params.append('deadline_first', deadlineFirst);
  if (deadlineSecond) params.append('deadline_second', deadlineSecond);
  if (rankingSource) params.append('ranking_source', rankingSource);
  if (rankingScore) params.append('ranking_score', rankingScore);

  // Show loading
  const spinner = document.getElementById('loading-spinner');
  const resultsContainer = document.getElementById('results-container');
  if (spinner) spinner.style.display = 'block';
  if (resultsContainer) resultsContainer.innerHTML = '';

  try {
    // Importat line: Refers to the search.ts file in the functions folder
    const response = await fetch(`${window.API_BASE}/api/search?${params}`);
    const data = await response.json();

    if (data.results) {
      renderResults(data.results);
    } else {
      resultsContainer.innerHTML = '<p class="text-muted text-center">No results found.</p>';
    }
  } catch (error) {
    console.error('Search failed:', error);
    resultsContainer.innerHTML = '<p class="text-danger text-center">Search failed. Please try again.</p>';
  } finally {
    if (spinner) spinner.style.display = 'none';
  }
}

/**
 * Render search results
 */
function renderResults(results) {
  const container = document.getElementById('results-container');

  if (!results || results.length === 0) {
    container.innerHTML = '<p class="text-muted text-center">No results found.</p>';
    return;
  }

  container.innerHTML = `
    <h4 class="mb-3">Conference Results (${results.length})</h4>
    ${results.map((conf, index) => renderConferenceCard(conf, index + 1)).join('')}
  `;

  // Attach favorite button handlers
  attachFavoriteHandlers();
}

/**
 * Render a single conference card
 */
function renderConferenceCard(conf, index) {
  const isFavorite = window.userFavorites?.includes(conf.id);
  const isLoggedIn = !!window.currentUser;

  // Build rankings HTML
  const rankingsHtml = buildRankingsHtml(conf.core, conf.h5_index, conf.h5_median);

  // Format location
  const location = [conf.city, conf.country].filter(Boolean).join(', ') || 'N/A';

  return `
    <div class="result-card mb-3">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>
          <h5 class="mb-1">
            <strong>${index}.</strong> ${conf.id}
            ${conf.url ? `
              <a href="${conf.url}" target="_blank" rel="noopener noreferrer" class="ms-2">
                <span class="full-url">${conf.title || conf.id}</span>
                <span class="short-url">Go to Page ➪</span>
              </a>
            ` : `<span class="ms-2 text-muted">${conf.title || conf.id}</span>`}
          </h5>
        </div>
      </div>

      <div class="d-flex gap-2 mb-2">
        ${isLoggedIn ? `
          <button type="button"
                  class="btn btn-sm favorite-btn ${isFavorite ? 'btn-success' : 'btn-outline-primary'}"
                  data-conference-id="${conf.id}"
                  data-state="${isFavorite ? 'saved' : 'empty'}">
            ${isFavorite ? '✓ Saved!' : '☆ Favorite'}
          </button>
          <a href="/edit-conference.html?id=${encodeURIComponent(conf.id)}" class="btn btn-warning btn-sm">
            Edit
          </a>
        ` : `
          <button class="btn btn-outline-secondary btn-sm" disabled title="Login to save">
            ☆ Favorite
          </button>
          <button class="btn btn-outline-secondary btn-sm" disabled title="Login to edit">
            Edit
          </button>
        `}
      </div>

      <p class="text-muted mb-2">
        <strong>Location:</strong> ${location} |
        <strong>Start:</strong> ${formatDate(conf.start_date)} |
        <strong>End:</strong> ${formatDate(conf.end_date)}
      </p>

      <div class="mb-2">
        <a href="${buildGoogleCalendarUrl(conf)}" target="_blank" class="google-calendar-button btn btn-sm me-1">
          Add to Google Calendar
        </a>
        <a href="${buildOutlookUrl(conf)}" target="_blank" class="outlook-button btn btn-sm">
          Add to Outlook
        </a>
      </div>

      <p class="small text-muted mb-2">
        <strong>Deadline:</strong> ${formatDate(conf.deadline)}<br>
        <strong>Topics:</strong> ${(conf.topics || '').replace(/\n/g, ', ') || 'N/A'}
      </p>

      <details>
        <summary class="small">Rankings & Metrics</summary>
        <div class="mt-2">${rankingsHtml}</div>
      </details>
    </div>
  `;
}

/**
 * Build rankings HTML
 */
function buildRankingsHtml(core, h5Index, h5Median) {
  const rankingKeys = ['CORE2023', 'CORE2021', 'CORE2020', 'CORE2018', 'CORE2017', 'CORE2014', 'CORE2013', 'ERA2010'];
  let html = '';
  let hasRankings = false;

  // CORE/ERA rankings table
  const rankings = [];
  for (const key of rankingKeys) {
    if (core && core[key]) {
      hasRankings = true;
      rankings.push(`<tr><th class="fw-semibold">${key}</th><td>${core[key]}</td></tr>`);
    }
  }

  if (rankings.length > 0) {
    html += `<table class="table table-sm mb-2"><tbody>${rankings.join('')}</tbody></table>`;
  }

  // H5 metrics
  const metrics = [];
  if (h5Index != null) {
    hasRankings = true;
    metrics.push(`<span class="badge text-bg-secondary me-1">h5-index: ${h5Index}</span>`);
  }
  if (h5Median != null) {
    hasRankings = true;
    metrics.push(`<span class="badge text-bg-secondary">h5-median: ${h5Median}</span>`);
  }

  if (metrics.length > 0) {
    html += `<div>${metrics.join('')}</div>`;
  }

  if (!hasRankings) {
    return '<p class="small text-muted mb-0">No ranking data available.</p>';
  }

  return html;
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Build Google Calendar URL
 */
function buildGoogleCalendarUrl(conf) {
  const formatGcalDate = (dateStr) => {
    if (!dateStr) return '';
    return dateStr.replace(/[-:]/g, '').split('T')[0];
  };

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${conf.id} - ${conf.title || ''}`.trim(),
    dates: `${formatGcalDate(conf.start_date)}/${formatGcalDate(conf.end_date)}`,
    location: [conf.city, conf.country].filter(Boolean).join(', '),
    details: conf.url || '',
  });

  return `https://www.google.com/calendar/render?${params}`;
}

/**
 * Build Outlook calendar URL
 */
function buildOutlookUrl(conf) {
  const params = new URLSearchParams({
    allday: 'true',
    body: conf.topics || '',
    enddt: conf.end_date || '',
    location: [conf.city, conf.country].filter(Boolean).join(', '),
    path: '/calendar/action/compose',
    rru: 'addevent',
    startdt: conf.start_date || '',
    subject: `${conf.id} - ${conf.title || ''}`.trim(),
  });

  return `https://outlook.office.com/calendar/0/deeplink/compose?${params}`;
}

/**
 * Handle ranking source change
 */
function handleRankingSourceChange(event) {
  const source = event.target.value;
  const container = document.getElementById('ranking-score-container');

  if (!source) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'block';

  if (source === 'scholar') {
    container.innerHTML = `
      <label class="form-label">Minimum h5-index:</label>
      <input type="number" class="form-control" id="ranking-score" min="0" placeholder="e.g., 50">
    `;
  } else {
    container.innerHTML = `
      <label class="form-label">Minimum Ranking:</label>
      <select class="form-control" id="ranking-score">
        <option value="">Any</option>
        <option value="A*">A*</option>
        <option value="A">A or higher</option>
        <option value="B">B or higher</option>
        <option value="C">C or higher</option>
      </select>
    `;
  }
}
