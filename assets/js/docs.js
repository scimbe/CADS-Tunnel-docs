(function () {
 var content = document.querySelector('main.content');
 if (!content) return;

 // ---- Per-page table of contents (right column on desktop, hamburger overlay on mobile) ----
 var headings = Array.prototype.slice.call(content.querySelectorAll('h2, h3'));
 var tocNav = document.getElementById('page-toc');
 var tocList = tocNav ? tocNav.querySelector('ul') : null;

 if (tocNav && tocList && headings.length > 1) {
  var used = {};
  headings.forEach(function (h) {
   if (!h.id) {
    var base = h.textContent.trim().toLowerCase()
     .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-') || 'section';
    var n = used[base] || 0;
    used[base] = n + 1;
    h.id = n > 0 ? base + '-' + n : base;
   }
   var li = document.createElement('li');
   if (h.tagName === 'H3') li.className = 'toc-sub';
   var a = document.createElement('a');
   a.href = '#' + h.id;
   a.textContent = h.textContent;
   li.appendChild(a);
   tocList.appendChild(li);
  });
  tocNav.hidden = false;

  var links = Array.prototype.slice.call(tocList.querySelectorAll('a'));
  var linkById = {};
  links.forEach(function (a) { linkById[a.getAttribute('href').slice(1)] = a; });

  if ('IntersectionObserver' in window) {
   var headingObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
     var link = linkById[entry.target.id];
     if (link && entry.isIntersecting) {
      links.forEach(function (a) { a.classList.remove('active'); });
      link.classList.add('active');
     }
    });
   }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });
   headings.forEach(function (h) { headingObserver.observe(h); });
  }

  var toggle = document.getElementById('toc-toggle');
  var backdrop = document.getElementById('toc-backdrop');
  function closeToc() {
   document.body.classList.remove('toc-open');
   if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
  function openToc() {
   document.body.classList.add('toc-open');
   if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }
  if (toggle) {
   toggle.hidden = false;
   toggle.addEventListener('click', function () {
    document.body.classList.contains('toc-open') ? closeToc() : openToc();
   });
  }
  if (backdrop) backdrop.addEventListener('click', closeToc);
  links.forEach(function (a) { a.addEventListener('click', closeToc); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeToc(); });
 }

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
})();
