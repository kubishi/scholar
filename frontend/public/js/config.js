// Auth0 Configuration
// Update these values with your Auth0 application settings
window.AUTH0_CONFIG = {
  domain: 'YOUR_AUTH0_DOMAIN.auth0.com',     // e.g., 'kubishi.auth0.com'
  clientId: 'YOUR_AUTH0_CLIENT_ID',          // Your Auth0 application Client ID
  audience: 'YOUR_API_AUDIENCE',             // Your API identifier in Auth0
  redirectUri: window.location.origin,
};

// API base URL (empty for same-origin)
window.API_BASE = '';
