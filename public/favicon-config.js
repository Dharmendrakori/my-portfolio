/**
 * Central Favicon Configuration
 * Change the path below to update the favicon across all pages.
 */
(function () {
  const FAVICON_CONFIG = {
    type: 'image/png',
    href: '/public/images/favicon.png',
    sizes: '32x32',
  };

  function setFavicon() {
    // Remove any existing favicon links
    const existing = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    existing.forEach((el) => el.remove());

    // Create and inject the new favicon link
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = FAVICON_CONFIG.type;
    link.href = FAVICON_CONFIG.href;
    if (FAVICON_CONFIG.sizes) {
      link.sizes = FAVICON_CONFIG.sizes;
    }
    document.head.appendChild(link);
  }

  // Run as early as possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setFavicon);
  } else {
    setFavicon();
  }
})();