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

  // Scrollspy: use native CSS scroll-target-group (:target-current) with aria-current sync,
  // and fall back to IntersectionObserver in browsers without scroll-target-group.
  const sectionLinks = menu ? [...menu.querySelectorAll('a[href^="#"]')] : [];
  const sections = sectionLinks
    .map((link) => document.getElementById(link.getAttribute('href').slice(1)))
    .filter(Boolean);

  if (sectionLinks.length && sections.length) {
    const supportsScrollTargetGroup =
      typeof CSS !== 'undefined' && CSS.supports('scroll-target-group: auto');

    if (supportsScrollTargetGroup) {
      const syncAriaCurrent = () => {
        const currentLink = menu.querySelector('a:target-current');
        sectionLinks.forEach((link) => {
          link.setAttribute('aria-current', link === currentLink ? 'true' : 'false');
        });
      };
      // Wait for first layout/paint so :target-current has resolved on initial load.
      requestAnimationFrame(() => requestAnimationFrame(syncAriaCurrent));
      window.addEventListener('load', syncAriaCurrent, { once: true });
      document.addEventListener('scrollend', syncAriaCurrent);
      window.addEventListener('hashchange', () => requestAnimationFrame(syncAriaCurrent));
    } else {
      const setActiveId = (activeId) => {
        sectionLinks.forEach((link) => {
          const isActive = link.getAttribute('href') === '#' + activeId;
          link.classList.toggle('target-current', isActive);
          link.setAttribute('aria-current', isActive ? 'true' : 'false');
        });
      };

      const initialHash = location.hash.slice(1);
      setActiveId(sections.some((s) => s.id === initialHash) ? initialHash : sections[0].id);

      const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

      sections.forEach((section) => sectionObserver.observe(section));

      // Handle clicking links directly and reaching the very bottom of the page
      sectionLinks.forEach((link) => {
        link.addEventListener('click', () => setActiveId(link.getAttribute('href').slice(1)));
      });
      window.addEventListener('scroll', () => {
        if (window.scrollY <= 8) setActiveId(sections[0].id);
        else if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          setActiveId(sections[sections.length - 1].id);
        }
      }, { passive: true });
    }
  }

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
