const connectSemanticScholarButton = document.getElementById('connect-semantic-scholar-btn');
const semanticScholarModal = document.getElementById('semantic-scholar-modal');
const cancelSemanticScholarButton = document.getElementById('cancel-semantic-scholar-btn');
const saveSemanticScholarButton = document.getElementById('save-semantic-scholar-btn');
const semanticScholarAuthorIdInput = document.getElementById('semantic-scholar-author-id');

if (connectSemanticScholarButton) {
  connectSemanticScholarButton.addEventListener('click', () => {
    if (semanticScholarModal) semanticScholarModal.style.display = 'flex';
    if (semanticScholarAuthorIdInput) semanticScholarAuthorIdInput.value = '';
  });
}

if (cancelSemanticScholarButton && semanticScholarModal) {
  cancelSemanticScholarButton.addEventListener('click', () => {
    semanticScholarModal.style.display = 'none';
  });
}

if (saveSemanticScholarButton && semanticScholarAuthorIdInput && semanticScholarModal) {
    saveSemanticScholarButton.addEventListener('click', async () => {
      const authorId = semanticScholarAuthorIdInput.value.trim();
      if (!authorId) {
        alert('Please enter your Semantic Scholar Author ID.');
        return;
      }
      saveSemanticScholarButton.disabled = true;
      try {
        const token = await getAuthToken();
        const res = await fetch(`${window.API_BASE || ''}/api/scholar_api/semantic_scholar_api?author_id=${encodeURIComponent(authorId)}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok && data.author) {
          alert('Semantic Scholar profile connected successfully.');
          semanticScholarModal.style.display = 'none';
        } else {
          alert(data.error || 'Failed to connect Semantic Scholar profile.');
        }
      } catch (err) {
        console.error(err);
        alert('Something went wrong. Please try again.');
      } finally {
        saveSemanticScholarButton.disabled = false;
      }
    });
  }
  