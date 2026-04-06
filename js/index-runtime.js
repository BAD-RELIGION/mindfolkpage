(() => {
  const OFFSET = 100;
  const NAV_IDS = ['top', 'history', 'revival', 'goodwood', 'staking', 'links'];
  const ALL_IDS = ['top', 'history', 'mindfolk-streak', 'revival', 'goodwood', 'staking', 'links'];

  function setNavbarScrolled() {
    const nav = document.querySelector('.navbar');
    if (!nav) return;
    const scrolled = window.scrollY > 10;
    nav.classList.toggle('navbar-scrolled', scrolled);
  }

  function wireLogoSwap() {
    const nav = document.querySelector('.navbar');
    const logo = document.getElementById('nav-logo');
    if (!nav || !logo) return;

    function swapLogo(newSrc) {
      if ((logo.getAttribute('src') || '').includes(newSrc)) return;
      logo.classList.add('fading');
      window.setTimeout(() => {
        logo.setAttribute('src', newSrc);
        logo.classList.remove('fading');
      }, 200);
    }

    function onScroll() {
      const scrolled = window.scrollY > 10;
      nav.classList.toggle('navbar-scrolled', scrolled);
      swapLogo(scrolled ? 'img/mfblack.png' : 'img/mfwhite.png');
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function wireNavScrollSpy() {
    const sectionsAll = ALL_IDS.map((id) => document.getElementById(id)).filter(Boolean);
    const navLinks = Array.from(document.querySelectorAll('#navbarSupportedContent .nav-link')).filter((a) =>
      NAV_IDS.includes((a.getAttribute('href') || '').replace('#', ''))
    );

    if (!sectionsAll.length || !navLinks.length) return;

    function setActive(id) {
      navLinks.forEach((a) => {
        const match = a.getAttribute('href') === '#' + id;
        a.classList.toggle('active', match);
        if (match) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    }

    let layoutAll = [];
    function recompute() {
      layoutAll = sectionsAll
        .map((sec) => {
          const top = sec.offsetTop;
          const height = sec.offsetHeight || 1;
          return { id: sec.id, top, bottom: top + height };
        })
        .sort((a, b) => a.top - b.top);
    }

    function nearestNavForY(y) {
      let candidate = NAV_IDS[0];
      for (const id of NAV_IDS) {
        const sec = layoutAll.find((s) => s.id === id);
        if (sec && y >= sec.top) candidate = id;
        else break;
      }
      return candidate;
    }

    function onScroll() {
      const y = window.scrollY + OFFSET;
      let current = layoutAll[0]?.id;
      for (const s of layoutAll) {
        if (y >= s.top && y < s.bottom) {
          current = s.id;
          break;
        }
      }
      const currentForNav = NAV_IDS.includes(current) ? current : nearestNavForY(y);
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        setActive('links');
      } else {
        setActive(currentForNav);
      }
    }

    recompute();
    window.addEventListener(
      'resize',
      () => {
        recompute();
        onScroll();
      },
      { passive: true }
    );
    window.addEventListener('scroll', onScroll, { passive: true });

    navLinks.forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = (a.getAttribute('href') || '').slice(1);
        const el = document.getElementById(id);
        if (!el) return;
        e.preventDefault();
        setActive(id);
        const y = el.getBoundingClientRect().top + window.pageYOffset - OFFSET + 1;
        window.scrollTo({ top: y, behavior: 'smooth' });

        const navEl = document.getElementById('navbarSupportedContent');
        if (navEl && navEl.classList.contains('show')) {
          try {
            if (window.mdb?.Collapse) new mdb.Collapse(navEl).hide();
            else navEl.classList.remove('show');
          } catch (_) {
            navEl.classList.remove('show');
          }
        }
      });
    });

    setActive('top');
    onScroll();
  }

  function wireTypewriter() {
    const titleEl = document.getElementById('type-title');
    const subEl = document.getElementById('type-sub');
    if (!titleEl || !subEl) return;

    const titleText = 'MINDFOLK';
    const subText = 'A new chapter begins. Rebuilding. Rebranding. Rising stronger.';

    function type(el, text, speed = 80) {
      return new Promise((resolve) => {
        el.textContent = '';
        let i = 0;
        const tick = () => {
          el.textContent = text.slice(0, i++);
          if (i <= text.length) window.setTimeout(tick, speed);
          else {
            el.classList.add('done');
            resolve();
          }
        };
        tick();
      });
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      titleEl.textContent = titleText;
      subEl.textContent = subText;
      titleEl.classList.add('done');
      subEl.classList.add('done');
    } else {
      type(titleEl, titleText, 125)
        .then(() => new Promise((r) => window.setTimeout(r, 300)))
        .then(() => type(subEl, subText, 45));
    }
  }

  function init() {
    wireNavScrollSpy();
    wireTypewriter();
    wireLogoSwap();
    setNavbarScrolled();
    window.addEventListener('scroll', setNavbarScrolled, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

