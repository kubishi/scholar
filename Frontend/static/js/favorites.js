// ---- helpers ----
function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') : null;
}

function setFavButtonState(btn, saved) {
  if (saved) {
    btn.classList.remove('btn-outline-primary');
    btn.classList.add('btn-success');
    btn.textContent = '✓ Saved!';
    btn.dataset.state = 'saved';
    btn.setAttribute('aria-pressed', 'true');
  } else {
    btn.classList.remove('btn-success');
    btn.classList.add('btn-outline-primary');
    btn.textContent = '☆ Favorite';
    btn.dataset.state = 'empty';
    btn.setAttribute('aria-pressed', 'false');
  }
}

// ---- event delegation (works for current and future results) ----
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.favorite-btn');
  if (!btn) return;

  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    alert('CSRF token missing. Make sure <meta name="csrf-token" ...> is in your base template.');
    return;
  }

  const id = btn.dataset.conferenceId;
  btn.disabled = true;

  try {
    const res = await fetch('/favorite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken,     // Flask-WTF checks this
        'X-Requested-With': 'fetch'   // tells server to return JSON
      },
      body: JSON.stringify({ conference_id: id })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed');

    setFavButtonState(btn, data.status === 'added');
  } catch (err) {
    console.error(err);
    alert('❌ Failed to save: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});
