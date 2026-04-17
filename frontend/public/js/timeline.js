function renderTimeline(conferences) {
  const container = document.getElementById('timeline-container');

  const today = new Date();
  const hasFutureDate = c => [c.deadline, c.notification, c.start_date, c.end_date]
    .some(d => d && new Date(d) >= today);

  const withDates = conferences.filter(c => (c.deadline || c.start_date) && hasFutureDate(c));
  const noDates   = conferences.filter(c => !hasFutureDate(c));

  if (withDates.length === 0) {
    container.innerHTML = '<p class="text-muted text-center py-3">No conferences with dates to display.</p>';
    return;
  }

  const allDates = withDates.flatMap(c =>
    [c.deadline, c.notification, c.start_date, c.end_date]
      .filter(Boolean).map(d => new Date(d))
  );
  const minDate = today;
  const maxDate = new Date(Math.max(...allDates));
  const LABEL_W = 160;

  const pct = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const monthIdx = months.findIndex(m =>
      m.getFullYear() === d.getFullYear() && m.getMonth() === d.getMonth()
    );
    if (monthIdx === -1) return d < minDate ? 0 : 100;
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const dayFraction = (d.getDate() - 1) / daysInMonth;
    return ((monthIdx + dayFraction) / months.length) * 100;
  };

  // Build month tick marks
  const months = [];
  const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const endMonth = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1);
  while (cur < endMonth) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }

  const monthHeader = `
    <div style="position:relative; height:24px; margin-left:${LABEL_W}px; border-bottom:2px solid #ccc; margin-bottom:4px;">
      ${months.map((m, i) => {
        const p = ((i + 0.5) / months.length) * 100;
        const tickP = (i / months.length) * 100;
        const label = m.getMonth() === 0
          ? m.toLocaleString('en-US', { month: 'short' }) + " '" + String(m.getFullYear()).slice(2)
          : m.toLocaleString('en-US', { month: 'short' });
        return `
          ${i > 0 ? `<span style="position:absolute;left:${tickP}%;top:0;bottom:0;width:1px;background:#ccc;"></span>` : ''}
          <span style="position:absolute;left:${p}%;transform:translateX(-50%);font-size:0.7rem;color:#666;white-space:nowrap;">${label}</span>`;
      }).join('')}
    </div>`;

  const rows = withDates.map(c => {
    const markers = [
      { date: c.deadline,     cls: 'tl-deadline',     label: 'Deadline' },
      { date: c.notification, cls: 'tl-notification', label: 'Notification' },
      { date: c.start_date,   cls: 'tl-start',        label: 'Start' },
      { date: c.end_date,     cls: 'tl-end',          label: 'End' },
    ].filter(m => m.date);

    const markersHtml = markers.map(m => {
      if (new Date(m.date) < today) return '';
      const p = pct(m.date);
      if (p === null) return '';
      return `<span class="tl-marker ${m.cls}"
                style="left:${p}%"
                data-conf="${c.id}"
                data-label="${m.label}"
                data-date="${m.date}"></span>`;
    }).join('');

    const gridlines = months.slice(1).map((_, i) => {
      const p = ((i + 1) / months.length) * 100;
      return `<span style="position:absolute;left:${p}%;top:0;bottom:0;width:1px;background:#eee;pointer-events:none;"></span>`;
    }).join('');

    return `
      <div class="tl-row" style="margin-left:${LABEL_W}px;">
        <span class="tl-label" style="left:-${LABEL_W}px;width:${LABEL_W}px;" title="${c.id}">${c.id}</span>
        <div class="tl-bar"></div>
        ${gridlines}
        ${markersHtml}
      </div>`;
  }).join('');

  const legend = `
    <div class="d-flex gap-3 flex-wrap mb-2" style="font-size:0.8rem;">
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#dc3545;vertical-align:middle;margin-right:4px;"></span>Deadline</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#fd7e14;vertical-align:middle;margin-right:4px;"></span>Notification</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#198754;vertical-align:middle;margin-right:4px;"></span>Start</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#6c757d;vertical-align:middle;margin-right:4px;"></span>End</span>
    </div>`;

  const noDatesNote = noDates.length > 0
    ? `<p class="text-muted small mt-2">${noDates.length} conference(s) without dates not shown(old conferences): ${noDates.map(c => c.id).join(', ')}</p>`
    : '';

  container.innerHTML = `<div style="overflow-x:auto;padding:1rem 1rem 1rem 0;">${legend}${monthHeader}${rows}${noDatesNote}</div>`;

  // Popover element (shared, repositioned on each click)
  const popover = document.createElement('div');
  popover.style.cssText = `
    position:fixed; z-index:1000; background:#fff; border:1px solid #ccc;
    border-radius:6px; padding:8px 12px; box-shadow:0 2px 8px rgba(0,0,0,0.15);
    font-size:0.85rem; pointer-events:none; display:none; max-width:220px;
  `;
  document.body.appendChild(popover);

  container.addEventListener('click', (e) => {
    const marker = e.target.closest('.tl-marker');
    if (!marker) {
      popover.style.display = 'none';
      return;
    }

    const conf = marker.dataset.conf;
    const label = marker.dataset.label;
    const date = formatDate(marker.dataset.date);

    popover.innerHTML = `<strong>${conf}</strong><br>${label}: ${date}`;
    popover.style.display = 'block';

    // Position near the click, keeping it on screen
    const x = e.clientX + 12;
    const y = e.clientY + 12;
    const pw = popover.offsetWidth  || 200;
    const ph = popover.offsetHeight || 50;
    popover.style.left = (x + pw > window.innerWidth  ? x - pw - 24 : x) + 'px';
    popover.style.top  = (y + ph > window.innerHeight ? y - ph - 24 : y) + 'px';

    e.stopPropagation();
  });

  document.addEventListener('click', () => { popover.style.display = 'none'; }, { capture: true });
}
