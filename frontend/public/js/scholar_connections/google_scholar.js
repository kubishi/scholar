const connectGoogleScholarButton = document.getElementById('connect-google-scholar-btn');
const googleScholarModal = document.getElementById('google-scholar-modal');
const cancelGoogleScholarButton = document.getElementById('cancel-google-scholar-btn');
const saveGoogleScholarButton = document.getElementById('save-google-scholar-btn');
const googleScholarAuthorIdInput = document.getElementById('google-scholar-author-id');

if (connectGoogleScholarButton) {
  connectGoogleScholarButton.addEventListener('click', () => {
    if (googleScholarModal) googleScholarModal.style.display = 'flex';
    if (googleScholarAuthorIdInput) googleScholarAuthorIdInput.value = '';
  });
}

if (cancelGoogleScholarButton && googleScholarModal) {
  cancelGoogleScholarButton.addEventListener('click', () => {
    googleScholarModal.style.display = 'none';
  });
}

// This is the function that will be called when the save button is clicked
if (saveGoogleScholarButton && googleScholarAuthorIdInput && googleScholarModal) {
  saveGoogleScholarButton.addEventListener('click', async () => {
    const authorId = googleScholarAuthorIdInput.value.trim();
    if (!authorId) {
      alert('Please enter your Google Scholar Author ID.');
      return;
    }
    saveGoogleScholarButton.disabled = true;
    try {
      const token = await getAuthToken();
      const res = await fetch(`${window.API_BASE || ''}/api/scholar_api/google_scholar_api?author_id=${encodeURIComponent(authorId)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok && data.author) {
        alert('Google Scholar profile connected successfully.');
        googleScholarModal.style.display = 'none';
      } else {
        alert(data.error || 'Failed to connect Google Scholar profile.');
      }
    } catch (err) {
      console.error(err);
      alert('Something went wrong. Please try again.');
    } finally {
      saveGoogleScholarButton.disabled = false;
    }
  });
}
