;(function () {
  const cfg = window.HFA_SITE || {};
  const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  const rawBase = (cfg.githubRawDataBase || 'https://raw.githubusercontent.com/ProtectThePack/page-updater-proto/main').replace(/\/+$/, '');
  /** Proto analytics worker (page beacons + custom events). Override with HFA_SITE.trackerApiBase. */
  const trackerOrigin = String(cfg.trackerApiBase || cfg.ctaTrackerOrigin || 'https://proto-analytics.hallieforanimals.workers.dev').replace(/\/+$/, '');

  function hfaDataJsonUrl(relPath) {
    const safeRel = String(relPath || '').replace(/^\/+/, '');
    return isLocal ? rawBase + '/' + safeRel : safeRel;
  }

  function getSessionId() {
    try {
      var k = 'hfa_session_id';
      var v = localStorage.getItem(k);
      if (v) return v;
      v = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(k, v);
      return v;
    } catch (_) {
      return 'sess_' + Date.now();
    }
  }

  /** POST /api/beacon — same format as proto-analytics Worker. */
  function postPageBeacon() {
    var beaconUrl = cfg.selfHostedBeacon;
    if (!beaconUrl && trackerOrigin) beaconUrl = trackerOrigin + '/api/beacon';
    if (!beaconUrl) return;
    var body = JSON.stringify({
      p: location.pathname || '/',
      r: document.referrer || '',
      w: window.innerWidth || 0,
      h: window.innerHeight || 0,
      l: (navigator.language || '').slice(0, 64)
    });
    try {
      fetch(beaconUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (_) {}
  }

  /** POST /api/custom-event — names + props for dashboards. */
  function sendCustomEvent(name, props) {
    if (!trackerOrigin) return;
    var payload = {
      name: String(name || 'event').slice(0, 128),
      pagePath: location.pathname || '/',
      sessionId: getSessionId(),
      props: props && typeof props === 'object' ? props : {}
    };
    var url = trackerOrigin + '/api/custom-event';
    var body = JSON.stringify(payload);
    try {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (_) {}
  }

  function slugifyDogKey(name) {
    var s = String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]+/g, '')
      .slice(0, 96);
    return s || 'unknown';
  }

  /** Stable dogKey keeps analytics when a dog is removed from dogs.json; prefer id or slug in JSON. */
  function trackDogClick(dog) {
    if (!dog) return;
    var id = dog.id != null && String(dog.id).trim() ? String(dog.id).trim() : '';
    var slug = dog.slug && String(dog.slug).trim() ? String(dog.slug).trim() : '';
    var dogKey = id || slug || slugifyDogKey(dog.name);
    sendCustomEvent('adoptable_dog_click', {
      dogKey: dogKey,
      dogName: dog.name ? String(dog.name) : '',
      dogId: id,
      dogSlug: slug,
      dogStatus: dog.status ? String(dog.status) : ''
    });
  }

  function trackEvent(name, params) {
    if (window.gtag && cfg.ga4MeasurementId) {
      window.gtag('event', name, params || {});
    }
    if (trackerOrigin && name !== 'page_view') {
      sendCustomEvent(name, params || {});
    }
  }

  function initAnalytics() {
    if (cfg.ga4MeasurementId && !window.gtag) {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga4MeasurementId);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', cfg.ga4MeasurementId, { send_page_view: true });
    }
    postPageBeacon();
  }

  async function loadAnnouncement() {
    const root = document.getElementById('announcement-root');
    if (!root) return;
    try {
      const res = await fetch(hfaDataJsonUrl('announcement.json'), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || data.enabled === false || !data.message) return;
      const link = (data.link || '').trim();
      const inner = link
        ? '<a href="' + link + '" style="color:inherit; text-decoration:none;">' + data.message + '</a>'
        : data.message;
      root.innerHTML = '<div class="announcement-bar">' + inner + '</div>';
    } catch (e) {
      console.warn('Announcement load failed:', e);
    }
  }

  async function loadAds() {
    try {
      const res = await fetch(hfaDataJsonUrl('ads.json'), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || data.enabled === false || !Array.isArray(data.placements)) return;
      data.placements.forEach((placement) => {
        if (!placement || placement.enabled === false || !placement.slot) return;
        const targets = document.querySelectorAll('[data-ad-slot="' + placement.slot + '"]');
        if (!targets.length) return;
        const candidates = Array.isArray(placement.ads) ? placement.ads.filter(a => a && a.enabled !== false && a.imageUrl && a.linkUrl) : [];
        if (!candidates.length) return;
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        targets.forEach((target) => {
          target.innerHTML = '<a class="ad-card" href="' + chosen.linkUrl + '" target="_blank" rel="noopener sponsored"><img src="' + chosen.imageUrl + '" alt="' + (chosen.alt || 'Sponsored') + '"></a>';
          trackEvent('ad_impression', { slot: placement.slot, adId: chosen.id || '' });
          const a = target.querySelector('a');
          if (a) a.addEventListener('click', () => trackEvent('ad_click', { slot: placement.slot, adId: chosen.id || '' }));
        });
      });
    } catch (_) {}
  }

  function attachContactForm(formSelector, successSelector) {
    const form = document.querySelector(formSelector);
    const success = document.querySelector(successSelector);
    if (!form) return;
    if (form.dataset.hfaBound === '1') return;
    form.dataset.hfaBound = '1';
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const actionAttr = (form.getAttribute('action') || '').trim();
      const actionEndpoint = (actionAttr && actionAttr !== '#') ? actionAttr : '';
      const endpoint = cfg.submissionsEndpoint || actionEndpoint || 'https://proto-submissions-inbox.hallieforanimals.workers.dev/api/submissions';
      if (!endpoint || endpoint === '#') {
        form.style.display = 'none';
        if (success) success.style.display = 'block';
        trackEvent('contact_submit_demo');
        return;
      }
      const fd = new FormData(form);
      const payload = {};
      fd.forEach((value, key) => {
        if (payload[key] === undefined) payload[key] = value;
        else if (Array.isArray(payload[key])) payload[key].push(value);
        else payload[key] = [payload[key], value];
      });
      payload.__page = location.pathname;
      payload.__kind = form.dataset.formKind || (form.id && form.id.includes('foster') ? 'foster' : (form.id && form.id.includes('adoption') ? 'adoption' : 'contact'));
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Submission failed');
        form.style.display = 'none';
        if (success) success.style.display = 'block';
        trackEvent('contact_submit_success');
      } catch (err) {
        alert('Sorry, your message could not be sent right now.');
        trackEvent('contact_submit_error', { message: String(err && err.message || 'error') });
      }
    });
  }

  window.hfaDataJsonUrl = hfaDataJsonUrl;
  window.hfaTrackEvent = trackEvent;
  window.hfaTrackDogClick = trackDogClick;
  window.hfaSendCustomEvent = sendCustomEvent;
  window.hfaLoadAds = loadAds;
  window.hfaLoadAnnouncement = loadAnnouncement;
  window.hfaAttachContactForm = attachContactForm;

  /**
   * When opening adoption-application.html?dog=Name (or dogName / interested_dog) from an adoptable-dog card,
   * pre-fill the "dog" field if present and empty.
   */
  function prefillAdoptionDogFromQuery() {
    try {
      var params = new URLSearchParams(location.search);
      var dog = params.get('dog') || params.get('dogName') || params.get('interested_dog');
      if (!dog) return;
      dog = decodeURIComponent(String(dog)).trim();
      if (!dog) return;
      var form =
        document.getElementById('adoption-application-form') ||
        document.querySelector('form.contact-form[data-form-kind="adoption"]');
      if (!form) return;
      var input =
        form.querySelector('input[name="dog"]') ||
        form.querySelector('textarea[name="dog"]') ||
        document.getElementById('cf-dog');
      if (input && !String(input.value || '').trim()) input.value = dog;
    } catch (_) {}
  }

  window.hfaPrefillAdoptionDogFromQuery = prefillAdoptionDogFromQuery;

  document.addEventListener('DOMContentLoaded', function () {
    prefillAdoptionDogFromQuery();
    document.querySelectorAll('form.contact-form').forEach((form) => {
      const wrap = form.closest('.contact-form-wrapper') || form.parentElement;
      const success = wrap ? wrap.querySelector('.contact-form-success') : null;
      if (!success) return;
      if (!form.id) form.id = 'hfa-form-' + Math.random().toString(36).slice(2, 8);
      if (!success.id) success.id = form.id + '-success';
      attachContactForm('#' + form.id, '#' + success.id);
    });
    initAnalytics();
    loadAnnouncement();
    loadAds();
  });
})();
