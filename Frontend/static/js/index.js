document.addEventListener('DOMContentLoaded', () => {
  // ---- Helpers ----
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const getCsrfToken = () => {
    const m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  };

  // ---- Dropzone init ----
  if (window.Dropzone) {
    Dropzone.autoDiscover = false;

    const dzEl = document.getElementById('my-awesome-dropzone');
    if (dzEl) {
      const myDropzone = new Dropzone('#my-awesome-dropzone', {
        paramName: 'file',
        maxFiles: 1,
        acceptedFiles: '.pdf',
        dictDefaultMessage: 'Click or drag a PDF of abstract here to upload',
        addRemoveLinks: true,
        headers: {
          'X-CSRFToken': getCsrfToken(),
        },
        init: function () {
          this.on('success', function (file, response) {
            console.log('File uploaded:', response);
            if (response && response.text) {
              const searchInput = document.getElementById('searchInput');
              if (searchInput) searchInput.value = response.text;
            }
          });

          this.on('maxfilesexceeded', function (file) {
            this.removeAllFiles();
            this.addFile(file);
          });

          this.on('addedfile', function (file) {
            if (file.previewElement) {
              file.previewElement.addEventListener('click', () => {
                this.removeFile(file);
              });
            }
          });
        },
      });
    }
  }

  // ---- Ranking source -> score control ----
  const sourceSelect = document.getElementById('ranking-source');
  const scoreContainer = document.getElementById('ranking-score-container');

  if (sourceSelect && scoreContainer) {
    const renderScoreField = (val) => {
      scoreContainer.innerHTML = '';
      if (!val) {
        scoreContainer.style.display = 'none';
        return;
      }
      scoreContainer.style.display = 'block';

      if (val === 'scholar') {
        scoreContainer.innerHTML = `
          <input type="text" name="ranking_score" class="form-control" placeholder="Enter Scholar Score">
        `;
      } else {
        scoreContainer.innerHTML = `
          <select name="ranking_score" class="form-control">
            <option value="">Select Ranking Score</option>
            <option value="A*">A*</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        `;
      }
    };

    // initial render (in case the page was loaded with a value)
    renderScoreField(sourceSelect.value);

    sourceSelect.addEventListener('change', function () {
      renderScoreField(this.value);
    });
  }

  // ---- Toggle topic visibility inside results ----
  // (Assumes .search_result .btn contains .topic-line)
  $$('.search_result .btn').forEach((button) => {
    button.addEventListener('click', function () {
      const topicEl = this.querySelector('.topic-line');
      if (topicEl) {
        topicEl.style.display = topicEl.style.display === 'none' ? 'block' : 'none';
      }
    });
  });

  // ---- Toggle between search modes ----
  const searchInput = document.getElementById('searchInput');
  const form = searchInput ? searchInput.closest('form') : null;
  // Optional: if you have a hybrid controls container, give it id="hybrid-controls"
  const hybridControls = document.getElementById('hybrid-controls');

  const setPlaceholderForMode = (mode) => {
    if (!searchInput) return;
    if (mode === 'semantic') {
      searchInput.placeholder = 'Search academic topics...';
      if (hybridControls) hybridControls.style.display = 'none';
    } else if (mode === 'hybrid') {
      searchInput.placeholder = 'Hybrid search: topics, acronyms, locations...';
      if (hybridControls) hybridControls.style.display = 'flex';
    } else {
      // id
      searchInput.placeholder = 'Search by conference ID...';
      if (hybridControls) hybridControls.style.display = 'none';
    }
  };

  // Attach listeners for radios
  $$('input[name="search_type"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      // Always keep the same field name
      if (searchInput) searchInput.name = 'query';
      setPlaceholderForMode(e.target.value);
    });
  });

  // Initialize placeholder on load from current query string
  const params = new URLSearchParams(location.search);
  const currentMode = params.get('search_type') || 'semantic';
  setPlaceholderForMode(currentMode);

  // Submit on Enter (no shift/ctrl)
  if (searchInput && form) {
    searchInput.addEventListener('keydown', function (event) {
      const isEnter = event.key === 'Enter';
      if (isEnter && !event.shiftKey && !event.ctrlKey) {
        event.preventDefault();
        form.submit();
        console.log('Enter key pressed, submitting form');
      }
    });
  }
});
