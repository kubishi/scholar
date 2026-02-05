document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();

  if (window.currentUser) {
    const profile = await getUserProfile();
    if (profile) {
      renderProfileDisplay(profile); 
    }
  }
  const userGreeting = document.getElementById('user-greeting');
  if (userGreeting) {
    userGreeting.addEventListener('click', () => {
      console.log('Clicked!');
      window.location.href = "/about.html";
    });
  }

  const editBtn = document.getElementById('edit-about-me-btn');
  const modal = document.getElementById('edit-about-me-modal');
  if (editBtn && modal) {
    editBtn.addEventListener('click', async () => {
      if (window.currentUser) {
        const profile = await getUserProfile();
        if (profile) populateEditForm(profile);
      }
      const isHidden = modal.style.display === 'none' || modal.style.display === '';
      modal.style.display = isHidden ? 'block' : 'none';
    });
  }

  const form = document.getElementById('edit-about-me-form');
  if (form) form.addEventListener('submit', handleEditAboutMeSubmit);
});

async function handleEditAboutMeSubmit(e) {
    e.preventDefault();
    const form = e.target;
    
    const body = {
      name: form.querySelector('#user-name').value,
      phone: form.querySelector('#phone-number').value,
      email: form.querySelector('#user-email').value,
      birthday: form.querySelector('#birthday').value,
      university: form.querySelector('#university').value,
      interests: form.querySelector('#interests').value,
      website: form.querySelector('#website').value,
      github: form.querySelector('#github').value,
      linkedin: form.querySelector('#linkedin').value,
      orcid: form.querySelector('#orcid').value,
    };

    const btn = form.querySelector('#save-about-me-btn');
    if (btn) btn.disabled = true;
    try {
      const token = await getAuthToken();
      const res = await fetch(`${window.API_BASE || ''}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      alert(data.ok ? 'Profile info saved.' : (data.error || 'Failed.'));
      if (data.ok) {
        renderProfileDisplay(body);
      } else {
        alert(data.error || 'Failed.');
      }
    } catch (err) {
      console.error(err);
      alert('Something went wrong with profile info to be updated in the database.');
    } finally {
      if (btn) btn.disabled = false;
    }
}

async function getUserProfile() {
  const token = await getAuthToken();
  const res = await fetch(`${window.API_BASE || ''}/api/profile`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json();
  return data.profile;
}

function renderProfileDisplay(profile) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val == "" ? 'N/A' : val;
  };
  // const setLink = (id, href) => {
  //   const el = document.getElementById(id);
  //   if (el) {
  //     el.href = href ?? '#';
  //     el.textContent = href == "" ? 'N/A' : href;
  //   }
  // };
  set('name', profile.name);
  set('phone-number', profile.phone);
  set('email', profile.email);
  set('research-interests', profile.interests);
  set('birthday', profile.birthday);
  set('university', profile.university);
  set('website', profile.website);
  set('github', profile.github);
  set('linkedin', profile.linkedin);
  set('orcid', profile.orcid);
}

function populateEditForm(profile) {
  const form = document.getElementById('edit-about-me-form');
  if (!form) return;
  const set = (sel, val) => {
    const el = form.querySelector(sel);
    if (el) el.value = val ?? '';
  };
  set('#user-name', profile.name);
  set('[name="phone"]', profile.phone);
  set('#user-email', profile.email);
  set('[name="birthday"]', profile.birthday);
  set('[name="university"]', profile.university);
  set('#interests', profile.interests);
  set('[name="website"]', profile.website);
  set('[name="github"]', profile.github);
  set('[name="linkedin"]', profile.linkedin);
  set('[name="orcid"]', profile.orcid);
}
