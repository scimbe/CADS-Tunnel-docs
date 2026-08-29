(function () {
 var content = document.querySelector('main.content');
 if (!content) return;

 // ---- Per-page table of contents: desktop sticky column + mirrored into
 // the single mobile menu panel (one heading scan, written to both lists,
 // so there's exactly one off-canvas panel instead of a separate one per
 // section). ----
 var headings = Array.prototype.slice.call(content.querySelectorAll('h2, h3'));
 var desktopToc = document.getElementById('page-toc');
 var desktopList = desktopToc ? desktopToc.querySelector('ul') : null;
 var mobileToc = document.getElementById('mobile-toc');
 var mobileList = mobileToc ? mobileToc.querySelector('ul') : null;

 var allTocLinks = [];
 if (desktopToc && desktopList && mobileToc && mobileList && headings.length > 1) {
  var used = {};
  headings.forEach(function (h) {
   if (!h.id) {
    var base = h.textContent.trim().toLowerCase()
     .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-') || 'section';
    var n = used[base] || 0;
    used[base] = n + 1;
    h.id = n > 0 ? base + '-' + n : base;
   }
   [desktopList, mobileList].forEach(function (list) {
    var li = document.createElement('li');
    if (h.tagName === 'H3') li.className = 'toc-sub';
    var a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;
    li.appendChild(a);
    list.appendChild(li);
    allTocLinks.push(a);
   });
  });
  desktopToc.hidden = false;
  mobileToc.hidden = false;

  var linksById = {};
  allTocLinks.forEach(function (a) {
   var id = a.getAttribute('href').slice(1);
   (linksById[id] = linksById[id] || []).push(a);
  });

  if ('IntersectionObserver' in window) {
   var headingObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
     if (!entry.isIntersecting) return;
     allTocLinks.forEach(function (a) { a.classList.remove('active'); });
     (linksById[entry.target.id] || []).forEach(function (a) { a.classList.add('active'); });
    });
   }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });
   headings.forEach(function (h) { headingObserver.observe(h); });
  }
 }

 // ---- Unified mobile menu: one hamburger, one panel (site nav + on-page
 // TOC together below 861px; TOC-only between 861-1179px where the
 // sidebar is already visible as a normal column -- see style.css). ----
 var menu = document.getElementById('mobile-menu');
 var toggle = document.getElementById('menu-toggle');
 var backdrop = document.getElementById('mobile-menu-backdrop');
 function closeMenu() {
  document.body.classList.remove('menu-open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
 }
 function openMenu() {
  document.body.classList.add('menu-open');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
 }
 if (toggle) {
  toggle.addEventListener('click', function () {
   document.body.classList.contains('menu-open') ? closeMenu() : openMenu();
  });
 }
 if (backdrop) backdrop.addEventListener('click', closeMenu);
 if (menu) {
  Array.prototype.slice.call(menu.querySelectorAll('a')).forEach(function (a) {
   a.addEventListener('click', closeMenu);
  });
 }
 document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

 // ---- Staggered scroll-reveal for list items ----
 var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if (!reduceMotion && 'IntersectionObserver' in window) {
  var lists = content.querySelectorAll('ul, ol');
  var revealObserver = new IntersectionObserver(function (entries, obs) {
   entries.forEach(function (entry) {
    if (entry.isIntersecting) {
     entry.target.classList.add('revealed');
     obs.unobserve(entry.target);
    }
   });
  }, { threshold: 0.15 });

  lists.forEach(function (list) {
   var items = Array.prototype.filter.call(list.children, function (el) { return el.tagName === 'LI'; });
   items.forEach(function (li, i) {
    li.classList.add('reveal-item');
    li.style.transitionDelay = (Math.min(i, 8) * 45) + 'ms';
    revealObserver.observe(li);
   });
  });
 }

 // ---- Copy-to-clipboard on every code block. A shell one-liner or .env block is
 // the worst thing to hand-select (multi-line, trailing backslashes) -- a lost or
 // mangled character from a manual drag-select breaks the copied command silently,
 // exactly the class of problem a maintainer hit live while following this site's
 // own instructions before this existed. ----
 if (navigator.clipboard) {
  content.querySelectorAll('pre > code').forEach(function (code) {
   var pre = code.parentElement;
   var btn = document.createElement('button');
   btn.className = 'copy-btn';
   btn.type = 'button';
   btn.textContent = 'Copy';
   btn.setAttribute('aria-label', 'Copy code to clipboard');
   btn.addEventListener('click', function () {
    navigator.clipboard.writeText(code.textContent).then(function () {
     btn.textContent = 'Copied';
     btn.classList.add('copied');
     setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
    });
   });
   pre.appendChild(btn);
  });
 }
})();
