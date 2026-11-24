'use strict';
(() => {
  const header = document.querySelector('.site-header');
  const inner = header?.querySelector('.header-inner');
  const menu = document.getElementById('site-menu');
  const menuButton = header?.querySelector('.menu-button');
  const nativePopover = Object.hasOwn(HTMLElement.prototype, 'popover');

  let lastHeaderWidth = 0;

  function isMenuOpen() {
    if (!menu) return false;
    return nativePopover
      ? menu.matches(':popover-open')
      : menu.classList.contains(':popover-open');
  }

  function showMenu() {
    if (!menu) return;
    if (nativePopover) {
      if (!menu.matches(':popover-open')) menu.showPopover();
    } else {
      menu.classList.add(':popover-open');
      menuButton?.setAttribute('aria-expanded', 'true');
    }
  }

  function hideMenu() {
    if (!menu) return;
    if (nativePopover) {
      if (menu.matches(':popover-open')) menu.hidePopover();
    } else {
      menu.classList.remove(':popover-open');
      menuButton?.setAttribute('aria-expanded', 'false');
    }
  }

  function syncNavLayout() {
    if (!header || !inner || !menu) return;
    const width = header.getBoundingClientRect().width;
    const wasWide = header.classList.contains('is-wide');

    // While collapsed, only remeasure if the header grew to avoid layout thrashing.
    if (!wasWide && lastHeaderWidth > 0 && width <= lastHeaderWidth) {
      lastHeaderWidth = width;
      return;
    }
    lastHeaderWidth = width;

    const wasOpen = !wasWide && isMenuOpen();

    header.classList.add('is-measuring');
    menu.removeAttribute('popover');
    header.classList.add('is-wide');

    const fitsInline = inner.scrollWidth <= inner.clientWidth;

    if (fitsInline) {
      header.classList.add('is-wide');
      menu.removeAttribute('popover');
      menu.classList.remove(':popover-open');
    } else {
      header.classList.remove('is-wide');
      menu.setAttribute('popover', 'auto');
      if (wasOpen) showMenu();
    }

    requestAnimationFrame(() => header.classList.remove('is-measuring'));
  }

  // Fallback toggle for browsers without native Popover API (no external CDN needed offline)
  if (!nativePopover && menu && menuButton) {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.addEventListener('click', () => {
      if (header.classList.contains('is-wide')) return;
      if (isMenuOpen()) hideMenu();
      else showMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isMenuOpen()) {
        hideMenu();
        menuButton.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (isMenuOpen() && !menu.contains(event.target) && !menuButton.contains(event.target)) {
        hideMenu();
      }
    });
  }

  // Close the collapsed popover after picking an in-page section link
  if (menu) {
    menu.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (link && !header.classList.contains('is-wide')) hideMenu();
    });
  }

  if (header && menu && typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => syncNavLayout());
    observer.observe(header);
    observer.observe(menu);
  }
  syncNavLayout();

  // Read-only summary of saved Kvasir Graph workspace on this device (if any)
  const metaEl = document.getElementById('graph-workspace-meta');
  if (metaEl) {
    try {
      const raw = localStorage.getItem('kvasir-graph-workspace-v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        const count = Array.isArray(parsed?.graphs) ? parsed.graphs.length : 0;
        if (count > 0) {
          metaEl.textContent = count === 1
            ? '1 saved graph on this device'
            : count + ' saved graphs on this device';
        }
      }
    } catch {
      // Ignore storage access errors in restricted modes
    }
  }
})();
