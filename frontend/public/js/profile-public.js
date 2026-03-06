document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const loadingEl = document.getElementById('profile-loading');
  const errorEl = document.getElementById('profile-error');
  const cardEl = document.getElementById('profile-card');

  if (!slug) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'block';
    if (errorEl) errorEl.textContent = 'No profile specified.';
    return;
  }

  try {
    const base = window.API_BASE || '';
    const res = await fetch(`${base}/api/profile/public/${encodeURIComponent(slug)}`);
    const text = await res.text();

    if (loadingEl) loadingEl.style.display = 'none';

    let data;
    try {
      data = text.startsWith('{') ? JSON.parse(text) : null;
    } catch (_) {
      data = null;
    }

    if (!res.ok || !data?.ok || !data?.profile) {
      if (errorEl) errorEl.style.display = 'block';
      return;
    }

    const p = data.profile;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? '';
    };
    const setLink = (id, href) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = '';
      if (href) {
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = href;
        el.appendChild(a);
      }
    };

    set('profile-name', p.name ?? p.given_name);
    set('profile-email', p.email);
    set('profile-interests', p.interests);
    set('profile-university', p.university);
    setLink('profile-website', p.website);
    setLink('profile-github', p.github);
    setLink('profile-linkedin', p.linkedin);
    set('profile-orcid', p.orcid);

    if (cardEl) cardEl.style.display = 'block';
  } catch (err) {
    console.error(err);
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'block';
  }
});
