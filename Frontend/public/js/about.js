document.addEventListener('DOMContentLoaded', () => {
  const userGreeting = document.getElementById('user-greeting');
  if (userGreeting) {
    userGreeting.addEventListener('click', () => {
      console.log('Clicked!');
      window.location.href = "/about.html";
    });
  }

  const editBtn = document.getElementById('edit-about-me-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const form = document.getElementById('edit-about-me-form');
      if (form) {
        const isHidden = form.style.display === 'none' || form.style.display === '';
        form.style.display = isHidden ? 'block' : 'none';
      }
    });
  }
});