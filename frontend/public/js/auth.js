// Auth0 Authentication Module

let auth0Client = null;
window.currentUser = null;
window.userFavorites = [];

/**
 * Initialize Auth0 client and check authentication state
 */
async function initAuth() {
  try {
    auth0Client = await auth0.createAuth0Client({
      domain: window.AUTH0_CONFIG.domain,
      clientId: window.AUTH0_CONFIG.clientId,
      authorizationParams: {
        audience: window.AUTH0_CONFIG.audience,
        redirect_uri: window.AUTH0_CONFIG.redirectUri,
      },
      cacheLocation: 'localstorage',
    });

    // Handle callback from Auth0
    if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
      try {
        await auth0Client.handleRedirectCallback();
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (error) {
        console.error('Callback error:', error);
      }
    }

    // Check if user is authenticated
    const isAuthenticated = await auth0Client.isAuthenticated();

    if (isAuthenticated) {
      // Fetch user data from our API
      const token = await auth0Client.getTokenSilently();
      const response = await fetch(`${window.API_BASE}/api/user`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          window.currentUser = data.user;
          window.userFavorites = data.favorites || [];
        }
      }
    }

    updateAuthUI();
  } catch (error) {
    console.error('Auth initialization error:', error);
  }
}

/**
 * Get access token for API calls
 */
async function getAuthToken() {
  if (!auth0Client) {
    throw new Error('Auth0 client not initialized');
  }
  return auth0Client.getTokenSilently();
}

/**
 * Login with Auth0
 */
async function login() {
  if (!auth0Client) {
    console.error('Auth0 client not initialized');
    return;
  }
  await auth0Client.loginWithRedirect();
}

/**
 * Logout from Auth0
 */
async function logout() {
  if (!auth0Client) {
    console.error('Auth0 client not initialized');
    return;
  }
  await auth0Client.logout({
    logoutParams: {
      returnTo: window.location.origin,
    },
  });
}

/**
 * Update UI based on authentication state
 */
function updateAuthUI() {
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userGreeting = document.getElementById('user-greeting');
  const adminLink = document.getElementById('admin-link');

  // Auth-required elements
  const authRequired = document.querySelectorAll('.auth-required');
  const noAuth = document.querySelectorAll('.no-auth');

  if (window.currentUser) {
    // User is logged in
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
    if (userGreeting) {
      userGreeting.innerHTML = `<strong>Welcome, ${window.currentUser.name || 'User'}!</strong>`;
    }

    // Show auth-required elements, hide no-auth elements
    authRequired.forEach(el => el.style.display = 'inline-block');
    noAuth.forEach(el => el.style.display = 'none');

    // Show admin link if user is admin
    if (adminLink && window.currentUser.privilege === 'admin') {
      adminLink.innerHTML = `
        <a href="/admin/approvals.html" class="conference-review-button btn btn-sm me-2">
          Review
        </a>
      `;
    }
  } else {
    // User is not logged in
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (userGreeting) {
      userGreeting.innerHTML = '<strong>Welcome!</strong>';
    }

    // Hide auth-required elements, show no-auth elements
    authRequired.forEach(el => el.style.display = 'none');
    noAuth.forEach(el => el.style.display = 'inline-block');

    if (adminLink) adminLink.innerHTML = '';
  }

  // Attach event listeners
  if (loginBtn) {
    loginBtn.addEventListener('click', login);
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
}
