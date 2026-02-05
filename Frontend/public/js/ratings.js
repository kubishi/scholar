/**
 * Handle user ratings submit
 */

// Set up ranking source change handler
function attachRatingsHandlers() {
    document.querySelectorAll('.user-ratings-form').forEach((form) => {
        // Remove existing listeners to prevent multiple event listeners
        form.replaceWith(form.cloneNode(true));
    });

    document.querySelectorAll('.user-ratings-form').forEach((form) => {
        // Add new listener
        // event listener refers to a function that is called when form is submitted
        // and this function has e for event which is the event object that is triggered when the form is submitted
        form.addEventListener('submit', handleUserRatingsSubmit);
    });
}

/**
 * Handle user ratings submit
 */
// e represents the event object that is triggered when the form is submitted
// e gives you all the ingormation about the form that was just submitted
async function handleUserRatingsSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const conferenceId = form.dataset.conferenceId;
    if (!conferenceId) return;
  
    const get = (name) => {
      const input = form.querySelector(`[name="${name}"]`);
      const n = parseInt(input?.value, 10);
      return (n >= 1 && n <= 10) ? n : 0;
    };
  
    const body = {
      conference_id: conferenceId,
      welcoming: get('welcoming-score'),
      insightful: get('insightful-score'),
      networking: get('networking-score'),
      interactivity: get('interactivity-score'),
      overall: get('overall-score'),
      caliber: get('caliber-score'),
      worthwhile: get('worthwhile-score'),
    };
  
    const btn = form.querySelector('.submit-ratings-btn');
    if (btn) btn.disabled = true;
    try {
      const token = await getAuthToken();
      const res = await fetch(`${window.API_BASE || ''}/api/user_conf_rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      alert(data.ok ? 'Ratings saved.' : (data.error || 'Failed.'));
    } catch (err) {
      console.error(err);
      alert('Something went wrong.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  

  async function getUserRatings(conferenceIds) {
    if (!conferenceIds?.length || !window.currentUser) return {};
    try{
      const token = await getAuthToken();
      const res = await fetch(`${window.API_BASE || ''}/api/user_conf_rating?conference_ids=${conferenceIds.join(',')}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return data.ok ? data.ratings : {};
    } catch (err) {
      console.error(err);
      return {};
    }
    }