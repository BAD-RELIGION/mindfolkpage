(() => {
  const STORAGE_KEY = 'mindfolkTheme';

  function initThemeToggle() {
    const track = document.querySelector('[data-theme-toggle]');
    if (!track) return;

    function applyTheme(theme) {
      document.body.setAttribute('data-theme', theme);
      track.setAttribute('aria-checked', String(theme !== 'light'));
    }

    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch (e) {}

    applyTheme(saved === 'light' ? 'light' : 'dark');

    track.addEventListener('click', function () {
      const next = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      applyTheme(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (e) {}
    });
  }

  function initHowtoTooltips() {
    document.addEventListener('click', function (e) {
      const trigger = e.target && e.target.closest ? e.target.closest('[data-howto-trigger]') : null;
      if (!trigger) return;
      const wrap = trigger.parentElement;
      if (!wrap) return;
      wrap.classList.toggle('is-open');
    });
  }

  function initValidatorLogoHideOnError() {
    const img = document.querySelector('.validator-hero-panel__logo');
    if (!img) return;
    img.addEventListener('error', () => {
      img.style.display = 'none';
    });
  }

  function init() {
    initThemeToggle();
    initHowtoTooltips();
    initValidatorLogoHideOnError();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

