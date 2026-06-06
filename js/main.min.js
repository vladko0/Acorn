/* Mobile Navigation Toggle */
(function() {
  var btn = document.querySelector('.mobile-menu-btn');
  var nav = document.querySelector('.nav');
  var header = document.querySelector('.header');

  if (btn && nav) {
    btn.setAttribute('aria-expanded', 'false');

    // Add phone link to mobile menu
    var phoneLink = document.createElement('a');
    phoneLink.href = 'tel:+359878744579';
    phoneLink.className = 'mobile-phone-link';
    phoneLink.innerHTML = '\u260E 0878 744 579';
    nav.appendChild(phoneLink);

    function closeMenu() {
      nav.classList.remove('open');
      btn.classList.remove('active');
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function() {
      var isOpen = nav.classList.toggle('open');
      btn.classList.toggle('active', isOpen);
      btn.setAttribute('aria-expanded', String(isOpen));
    });

    nav.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', closeMenu);
    });

    if (header) {
      document.addEventListener('click', function(e) {
        if (!header.contains(e.target)) {
          closeMenu();
        }
      });
    }
  }

  // Bottom nav - highlight active page
  var path = window.location.pathname;
  document.querySelectorAll('.bottom-nav a').forEach(function(a) {
    var page = a.getAttribute('data-page');
    if (
      (page === 'index' && (path === '/' || path.endsWith('index.html'))) ||
      (page === 'produkti' && (path.includes('produkti') || path.includes('produkt'))) ||
      (page === 'za-nas' && path.includes('za-nas')) ||
      (page === 'kontakti' && path.includes('kontakti'))
    ) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    }
  });

  // On the catalog page, a second tap on Products opens quick category links.
  // From every other page the first tap must navigate to the catalog.
  var prodLink = document.querySelector('.bottom-nav a[data-page="produkti"]');
  var overlay = document.querySelector('.cat-overlay');
  var panel = document.querySelector('.cat-panel');

  if (prodLink && panel && overlay) {
    prodLink.setAttribute('aria-expanded', 'false');
    prodLink.setAttribute('aria-controls', panel.id || 'category-panel');

    prodLink.addEventListener('click', function(e) {
      var onCatalog = path === '/produkti' || path.endsWith('/produkti.html');
      if (!onCatalog) return;
      e.preventDefault();
      var isOpen = panel.classList.toggle('open');
      overlay.classList.toggle('open', isOpen);
      prodLink.setAttribute('aria-expanded', String(isOpen));
    });

    overlay.addEventListener('click', function() {
      panel.classList.remove('open');
      overlay.classList.remove('open');
      prodLink.setAttribute('aria-expanded', 'false');
    });
  }

  // Product filters (catalog page)
  var filterBar = document.querySelector('.filter-bar');
  var filterBtns = document.querySelectorAll('.filter-btn');
  var filterInput = document.querySelector('.filter-search-input');
  var sections = document.querySelectorAll('section[id]');
  var noResults = document.querySelector('.filter-no-results');

  if (filterBar && filterBtns.length > 0 && sections.length > 0) {
    var activeFilter = 'all';

    function applyFilters() {
      var query = filterInput ? filterInput.value.toLowerCase().trim() : '';
      var totalVisible = 0;
      sections = document.querySelectorAll('section[id]');

      sections.forEach(function(sec) {
        var catId = sec.id;
        var catVisible = (activeFilter === 'all' || activeFilter === catId);
        var cards = sec.querySelectorAll('.product-card');
        var visibleCount = 0;

        cards.forEach(function(card) {
          var name = card.querySelector('h3').textContent.toLowerCase();
          var matchesText = !query || name.includes(query);
          var matchesCat = catVisible;

          if (matchesCat && matchesText) {
            card.classList.remove('hidden-card');
            visibleCount++;
            totalVisible++;
          } else {
            card.classList.add('hidden-card');
          }
        });

        if (!catVisible || visibleCount === 0) {
          sec.classList.add('hidden-section');
        } else {
          sec.classList.remove('hidden-section');
        }
      });

      if (noResults) {
        noResults.hidden = totalVisible !== 0;
      }
    }

    function selectFilter(filter) {
      var matchBtn = document.querySelector('.filter-btn[data-filter="' + filter + '"]');
      if (!matchBtn) return;

      filterBtns = document.querySelectorAll('.filter-btn');
      filterBtns.forEach(function(b) { b.classList.remove('active'); });
      matchBtn.classList.add('active');
      activeFilter = filter;
      applyFilters();
    }

    filterBar.addEventListener('click', function(event) {
      var btn = event.target.closest('.filter-btn');
      if (btn && filterBar.contains(btn)) {
        selectFilter(btn.getAttribute('data-filter'));
      }
    });

    if (filterInput) {
      filterInput.addEventListener('input', applyFilters);
    }
    document.addEventListener('acorn:products-rendered', function() {
      selectFilter(activeFilter);
    });

    function applyHashFilter() {
      var hash = window.location.hash.replace('#', '');
      if (hash && document.getElementById(hash)) {
        selectFilter(hash);
      }
    }

    applyFilters();
    applyHashFilter();
    window.addEventListener('hashchange', applyHashFilter);
  }

  // Search functionality
  var searchBtn = document.querySelector('.search-toggle');
  var searchOverlay = document.querySelector('.search-overlay');
  var searchClose = document.querySelector('.search-close');
  var searchInput = document.querySelector('.search-input');
  var searchResults = document.querySelector('.search-results');

  if (!searchBtn || !searchOverlay || !searchClose || !searchInput || !searchResults) return;

  var PRODUCTS = [
    { name: "Суров белен бадем", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/surov-belen-badem" },
    { name: "Суров бадем", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/surov-badem" },
    { name: "Филиран бадем", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/filiran-badem" },
    { name: "Бадемово брашно", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/bademovo-brashno" },
    { name: "Суров турски лешник", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/surov-turski-leshnik" },
    { name: "Суров български лешник", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/surov-bulgarski-leshnik" },
    { name: "Бланширан лешник", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/blanshiran-leshnik" },
    { name: "Суров шам фъстък", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/surov-sham-fastak" },
    { name: "Белен шам фъстък", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/belen-sham-fastak" },
    { name: "Сурово кашу размер 180", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/surovo-kashu" },
    { name: "Сурово кашу размер 320", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/surovo-kashu-320" },
    { name: "Кашу печено с люспа", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/kashu-pecheno-lyuspa" },
    { name: "Кашу печено размер 180", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/kashu-pecheno-180" },
    { name: "Кашу печено размер 320", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/kashu-pecheno-320" },
    { name: "Кокосови кубчета", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/kokosovi-kubcheta" },
    { name: "Бразилски орех", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/brazilski-oreh" },
    { name: "Кедрова ядка", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/kedrova-yadka" },
    { name: "Макадамия размер нула", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/makadamia" },
    { name: "Орехова ядка 1/4 еденица", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/orehova-yadka-chetvartak" },
    { name: "Орехова ядка 1/2 двойка", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/orehova-yadka-polovina" },
    { name: "Орехова ядка 1/2 двойка много бяла", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/orehova-yadka-polovina-byala" },
    { name: "Червена боровинка американска", cat: "Сушени плодове", url: "produkti/susheni-plodove/chervena-borovinka" },
    { name: "Синя боровинка", cat: "Сушени плодове", url: "produkti/susheni-plodove/sinya-borovinka" },
    { name: "Годжи бери", cat: "Сушени плодове", url: "produkti/susheni-plodove/godzhi-beri" },
    { name: "Златна стафида", cat: "Сушени плодове", url: "produkti/susheni-plodove/zlatna-stafida" },
    { name: "Стафиди тъмни", cat: "Сушени плодове", url: "produkti/susheni-plodove/stafidi-susheni" },
    { name: "Израелски фурми Меджул", cat: "Сушени плодове", url: "produkti/susheni-plodove/izraelski-furmi" },
    { name: "Натурални фурми Иран", cat: "Сушени плодове", url: "produkti/susheni-plodove/naturalni-furmi-iran" },
    { name: "Сушени сливи без костилка", cat: "Сушени плодове", url: "produkti/susheni-plodove/susheni-slivi" },
    { name: "Сушени смокини", cat: "Сушени плодове", url: "produkti/susheni-plodove/susheni-smokini" },
    { name: "Сушени чушки", cat: "Сушени плодове", url: "produkti/susheni-plodove/susheni-chushki" },
    { name: "Чилийска стафида едра", cat: "Сушени плодове", url: "produkti/susheni-plodove/chiliiska-stafida" },
    { name: "Сушена кайсия Джъмбо", cat: "Сушени плодове", url: "produkti/susheni-plodove/kaisiya-djumbo" },
    { name: "Натурална кайсия", cat: "Сушени плодове", url: "produkti/susheni-plodove/naturalna-kaisiya" },
    { name: "Захаросан джинджифил", cat: "Сушени плодове", url: "produkti/susheni-plodove/zaharosan-djindjifil" },
    { name: "Тъмна дребна стафида за производство", cat: "Сушени плодове", url: "produkti/susheni-plodove/tymna-drebna-stafida" },
    { name: "Печен бадем", cat: "Печени ядки и миксове", url: "produkti/pecheni-yadki/pechen-badem" },
    { name: "Печен лешник", cat: "Печени ядки и миксове", url: "produkti/pecheni-yadki/pechen-leshnik" },
    { name: "Печен микс", cat: "Печени ядки и миксове", url: "produkti/pecheni-yadki/pechen-miks" },
    { name: "Печен шам фъстък", cat: "Печени ядки и миксове", url: "produkti/pecheni-yadki/pechen-sham-fastak" },
    { name: "Микс Здраве - ядки плюс сушени плодове", cat: "Печени ядки и миксове", url: "produkti/pecheni-yadki/miks-zdrave" },
    { name: "Суров микс ядки Енерджи", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/miks-yadki-energy" },
    { name: "Пекан", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/pekan" },
    { name: "Суров фъстък", cat: "Сурови ядки и семена", url: "produkti/surovi-yadki/surov-fustuk" },
    { name: "Белено тиквено семе", cat: "Семена", url: "produkti/semena/beleno-tikveno-seme" },
    { name: "Белено конопено семе", cat: "Семена", url: "produkti/semena/beleno-konopeno-seme" },
    { name: "Чия", cat: "Семена", url: "produkti/semena/chiya" },
    { name: "Киноа", cat: "Семена", url: "produkti/semena/kinoa" },
    { name: "Белен слънчоглед", cat: "Семена", url: "produkti/semena/belen-slanchogled" }
  ];

  // Determine base path
  var base = '';
  if (window.location.pathname.includes('/produkti/')) {
    base = '../../';
  }

  var previousFocus;

  function openSearch() {
    previousFocus = document.activeElement;
    searchOverlay.classList.add('open');
    setTimeout(function() { searchInput.focus(); }, 100);
  }

  function closeSearch() {
    searchOverlay.classList.remove('open');
    searchInput.value = '';
    searchResults.innerHTML = '<p class="search-hint">Въведете поне 2 символа...</p>';
    if (previousFocus && previousFocus.focus) {
      previousFocus.focus();
    }
  }

  searchBtn.addEventListener('click', openSearch);
  searchClose.addEventListener('click', closeSearch);

  searchOverlay.addEventListener('click', function(e) {
    if (e.target === searchOverlay) {
      closeSearch();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && searchOverlay.classList.contains('open')) {
      closeSearch();
    }
  });

  searchInput.addEventListener('input', function() {
    var q = this.value.toLowerCase().trim();
    if (q.length < 2) {
      searchResults.innerHTML = '<p class="search-hint">Въведете поне 2 символа...</p>';
      return;
    }

    var availableProducts = window.AcornCatalog && window.AcornCatalog.searchProducts ?
      (window.AcornCatalog.searchProducts() || PRODUCTS) : PRODUCTS;
    var matches = availableProducts.filter(function(p) {
      return p.name.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q);
    });

    if (matches.length === 0) {
      searchResults.innerHTML = '';
      var emptyResult = document.createElement('p');
      emptyResult.className = 'search-no-results';
      emptyResult.textContent = 'Няма намерени продукти за "' + q + '"';
      searchResults.appendChild(emptyResult);
      return;
    }

    var html = '';
    matches.forEach(function(p) {
      html += '<a href="' + base + p.url + '" class="search-result-item">' +
        '<span class="search-result-name">' + p.name + '</span>' +
        '<span class="search-result-cat">' + p.cat + '</span>' +
        '</a>';
    });
    searchResults.innerHTML = html;
  });
})();
