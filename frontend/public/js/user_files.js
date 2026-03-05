const cancelFileAdderButton = document.getElementById('cancel-file-adder-btn');
const openFileAdderButton = document.getElementById('open-file-adder-btn');
const userPapersInput = document.getElementById('user_papers');
const fileAdderModal = document.getElementById('file-adder-modal');
const fileSaveButton = document.getElementById('save-file-adder-btn');
const userFilesPlaceholder = document.getElementById('user-files-placeholder');

// if (userFilesPlaceholder) {
//   renderUserFilesPlaceholder(userFilesPlaceholder);
// }

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

if (cancelFileAdderButton && fileAdderModal) {
  cancelFileAdderButton.addEventListener('click', () => { fileAdderModal.style.display = 'none'; });
}
if (openFileAdderButton && fileAdderModal) {
  openFileAdderButton.addEventListener('click', () => { fileAdderModal.style.display = 'flex'; });
}

if (fileSaveButton && fileAdderModal) {
  fileSaveButton.addEventListener('click', () => {
    const file = userPapersInput.files[0];
    uploadUserPapers(file);
  });
}



// userPapersInput.addEventListener('change', () => {
//     const file = userPapersInput.files[0];
//     console.log(file);
//     uploadUserPapers(file);
// });

const MAX_PDF_TEXT_LENGTH = 3000;

async function parsePdfToText(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      if (text.length >= MAX_PDF_TEXT_LENGTH) break;
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(' ') + '\n';
    }
    return text.slice(0, MAX_PDF_TEXT_LENGTH);
}

async function uploadUserPapers(file) {
    const text = await parsePdfToText(file);
    const fileName = file.name;
    // console.log(text, "TESTING the text", fileName);

    if (fileSaveButton) fileSaveButton.disabled = true;
    try {
        const token = await getAuthToken();
        const res = await fetch(`${window.API_BASE || ''}/api/user_docs/user_doc_profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ body: text, title: fileName }),
        });
        const data = await res.json();
        if (data.ok) {
            alert('File uploaded successfully');
            renderUserFilesPlaceholder(document.getElementById('user-files-placeholder'));
            if (fileAdderModal) fileAdderModal.style.display = 'none';
            if (userPapersInput) userPapersInput.value = '';
          } else {
            alert('Failed to upload file');
          }

    } catch (error) {
        console.error(error);
    } finally {
        if (fileSaveButton) fileSaveButton.disabled = false;
    }
}

async function getUserPapers() {
    const token = await getAuthToken();
    const res = await fetch(`${window.API_BASE || ''}/api/user_docs/user_doc_profile`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    return data.papers;
}

function renderUserPaper(paper) {
    const title = paper.paper_id || 'Untitled';
    const date = paper.created_at ? new Date(paper.created_at).toLocaleDateString() : '';
    return `
      <div class="border rounded p-3 mb-2">
        <div class="fw-semibold">${escapeHtml(title)}</div>
        <div class="small text-muted">Added ${date}</div>
      </div>
    `;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

async function renderUserFilesPlaceholder(container) {
    if (!container || !window.currentUser) {
      if (container) container.innerHTML = '<p class="text-muted">Log in to see your files.</p>';
      return;
    }
    try {
      const papers = await getUserPapers();
      if (papers && papers.length > 0) {
        container.innerHTML = `
          <h4 class="mb-3">Your Files (${papers.length})</h4>
          ${papers.map((paper) => renderUserPaper(paper)).join('')}
        `;
      } else {
        container.innerHTML = '<p class="text-muted">No files uploaded yet.</p>';
      }
    } catch (err) {
      console.error(err);
      container.innerHTML = '<p class="text-danger">Failed to load files.</p>';
    }
  }


  






















