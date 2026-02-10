// Favorites Module

/**
 * Attach event handlers to favorite buttons
 */
function attachFavoriteHandlers() {
  document.querySelectorAll('.favorite-btn').forEach((btn) => {
    // Remove existing listeners
    btn.replaceWith(btn.cloneNode(true));
  });

  document.querySelectorAll('.favorite-btn').forEach((btn) => {
    btn.addEventListener('click', handleFavoriteClick);
  });
}

/**
 * Handle favorite button click
 */
async function handleFavoriteClick(event) {
  const btn = event.currentTarget;
  const conferenceId = btn.dataset.conferenceId;

  if (!conferenceId) return;

  // Disable button during request
  btn.disabled = true;

  try {
    const token = await getAuthToken();
    const response = await fetch(`${window.API_BASE}/api/favorites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ conference_id: conferenceId }),
    });

    const data = await response.json();

    if (data.ok) {
      if (data.status === 'added') {
        // Update UI to show saved
        btn.classList.remove('btn-outline-primary');
        btn.classList.add('btn-success');
        btn.textContent = '✓ Saved!';
        btn.dataset.state = 'saved';

        // Update global favorites
        if (!window.userFavorites.includes(conferenceId)) {
          window.userFavorites.push(conferenceId);
        }
      } else {
        // Update UI to show not saved
        btn.classList.remove('btn-success');
        btn.classList.add('btn-outline-primary');
        btn.textContent = '☆ Favorite';
        btn.dataset.state = 'empty';

        // Update global favorites
        const index = window.userFavorites.indexOf(conferenceId);
        if (index > -1) {
          window.userFavorites.splice(index, 1);
        }
      }
    } else {
      console.error('Failed to update favorite:', data.error);
      alert('Failed to update favorite. Please try again.');
    }
  } catch (error) {
    console.error('Favorite error:', error);
    alert('An error occurred. Please try again.');
  } finally {
    btn.disabled = false;
  }
}
