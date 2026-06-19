/**
 * Central Favicon Configuration
 * Works from any page depth because paths are resolved against this script's own URL.
 */
(function () {
  const scripts = document.getElementsByTagName('script');
  const thisScript = scripts[scripts.length - 1];
  const faviconUrl = new URL('images/favicon.png', thisScript.src).href;

  function setFavicon() {
    const existing = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    existing.forEach((el) => el.remove());

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = faviconUrl;
    link.sizes = '32x32';
    document.head.appendChild(link);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setFavicon);
  } else {
    setFavicon();
  }
})();