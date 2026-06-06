(function() {
  'use strict';

  var siteRoot = new URL('../', document.currentScript.src);
  var siteRootPath = siteRoot.pathname;
  var dataUrl = new URL('data/products.json', siteRoot).toString();
  var catalogApi = window.AcornCatalog = {
    products: null,
    categories: [],
    loading: null
  };

  function categoryName(id) {
    var category = catalogApi.categories.find(function(item) { return item.id === id; });
    return category ? category.name : id;
  }

  function productUrl(product) {
    return new URL(product.url, siteRoot).toString();
  }

  function imageUrl(product) {
    return new URL(product.image, siteRoot).toString();
  }

  function thumbnailUrl(product) {
    if (product.image.indexOf('images/uploads/') === 0) return imageUrl(product);
    var filename = product.image.split('/').pop();
    return new URL('images/thumbs/' + filename, siteRoot).toString();
  }

  function catalogUrl(categoryId) {
    return new URL('produkti.html' + (categoryId ? '#' + categoryId : ''), siteRoot).toString();
  }

  function createCategoryPanelLink(category, index) {
    var link = document.createElement('a');
    link.href = catalogUrl(category ? category.id : '');
    var icon = document.createElement('span');
    var iconClasses = ['nuts', 'dried', 'roasted', 'seeds'];
    icon.className = 'cat-icon ' + (category ? (iconClasses[index] || 'nuts') : 'all');
    icon.textContent = category ? '\u2022' : '\u2605';
    var label = document.createElement('span');
    label.className = 'cat-label';
    label.textContent = category ? category.name : 'Всички продукти';
    var arrow = document.createElement('span');
    arrow.className = 'cat-arrow';
    arrow.textContent = '\u203a';
    link.appendChild(icon);
    link.appendChild(label);
    link.appendChild(arrow);
    return link;
  }

  function renderCategoryPanels() {
    document.querySelectorAll('.cat-panel-list').forEach(function(list) {
      list.innerHTML = '';
      list.appendChild(createCategoryPanelLink(null, 0));
      catalogApi.categories.forEach(function(category, index) {
        list.appendChild(createCategoryPanelLink(category, index));
      });
    });
  }

  function renderHomeCategories() {
    var existingCard = document.querySelector('.category-card');
    if (!existingCard) return;
    var grid = existingCard.parentElement;
    catalogApi.categories.forEach(function(category) {
      var existing = grid.querySelector('a[href$="#' + category.id + '"]');
      if (existing) return;
      var representative = catalogApi.products.find(function(product) {
        return product.category === category.id && product.published;
      });
      var card = document.createElement('a');
      card.href = catalogUrl(category.id);
      card.className = 'category-card';
      if (representative) {
        var imageWrap = document.createElement('div');
        imageWrap.className = 'category-card-image';
        var image = document.createElement('img');
        image.src = thumbnailUrl(representative);
        image.alt = category.name + ' на едро';
        image.loading = 'lazy';
        imageWrap.appendChild(image);
        card.appendChild(imageWrap);
      }
      var content = document.createElement('div');
      content.className = 'category-card-content';
      var name = document.createElement('h3');
      name.textContent = category.name;
      var more = document.createElement('span');
      more.className = 'link';
      more.textContent = 'Виж още \u2192';
      content.appendChild(name);
      content.appendChild(more);
      card.appendChild(content);
      grid.appendChild(card);
    });
  }

  function renderProductCategoryLinks() {
    var firstLink = document.querySelector('.category-link-card');
    if (!firstLink) return;
    var grid = firstLink.parentElement;
    grid.innerHTML = '';
    catalogApi.categories.forEach(function(category) {
      var link = document.createElement('a');
      link.href = catalogUrl(category.id);
      link.className = 'category-link-card';
      link.setAttribute('style', 'display:block;padding:20px;background:white;border-radius:12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.08);text-decoration:none;color:inherit;transition:transform 0.2s,box-shadow 0.2s;');
      var heading = document.createElement('h3');
      heading.setAttribute('style', 'margin:0;color:hsl(25,45%,35%);font-size:1rem;');
      heading.textContent = category.name;
      link.appendChild(heading);
      grid.appendChild(link);
    });
  }

  function createPriceRow(price, large) {
    var row = document.createElement('div');
    row.className = large ? 'price-row-large' : 'price-row';
    var size = document.createElement('span');
    size.className = large ? 'size' : 'price-size';
    size.textContent = price.size;
    var priceWrap = document.createElement('span');
    priceWrap.className = large ? 'price' : '';
    var eur = document.createElement('span');
    eur.className = large ? 'eur' : 'price-value';
    eur.textContent = price.eur;
    var bgn = document.createElement('span');
    bgn.className = large ? 'bgn' : 'price-bgn';
    bgn.textContent = '/ ' + price.bgn;
    priceWrap.appendChild(eur);
    priceWrap.appendChild(bgn);
    row.appendChild(size);
    row.appendChild(priceWrap);
    return row;
  }

  function createProductCard(product) {
    var card = document.createElement('a');
    card.href = productUrl(product);
    card.className = 'product-card';
    var imageWrap = document.createElement('div');
    imageWrap.className = 'product-card-image';
    var image = document.createElement('img');
    image.src = thumbnailUrl(product);
    image.alt = product.name + ' на едро';
    image.loading = 'lazy';
    imageWrap.appendChild(image);
    var content = document.createElement('div');
    content.className = 'product-card-content';
    var name = document.createElement('h3');
    name.textContent = product.name;
    content.appendChild(name);
    if (product.prices.length) {
      var prices = document.createElement('div');
      prices.className = 'product-prices';
      product.prices.forEach(function(price) {
        prices.appendChild(createPriceRow(price, false));
      });
      content.appendChild(prices);
    }
    card.appendChild(imageWrap);
    card.appendChild(content);
    return card;
  }

  function createCategorySection(category) {
    var section = document.createElement('section');
    section.className = 'section';
    section.id = category.id;
    var container = document.createElement('div');
    container.className = 'container';
    var title = document.createElement('div');
    title.className = 'section-title';
    var heading = document.createElement('h2');
    heading.textContent = category.name;
    var divider = document.createElement('div');
    divider.className = 'section-divider';
    var grid = document.createElement('div');
    grid.className = 'cards-grid';
    title.appendChild(heading);
    title.appendChild(divider);
    container.appendChild(title);
    container.appendChild(grid);
    section.appendChild(container);
    return section;
  }

  function ensureCategoryElements(category) {
    var filterBar = document.querySelector('.filter-bar');
    if (filterBar && !filterBar.querySelector('.filter-btn[data-filter="' + category.id + '"]')) {
      var filterButton = document.createElement('button');
      filterButton.type = 'button';
      filterButton.className = 'filter-btn';
      filterButton.setAttribute('data-filter', category.id);
      filterButton.textContent = category.name;
      filterBar.appendChild(filterButton);
    }

    var firstNavigationLink = catalogApi.categories.length ?
      document.querySelector('a[href="#' + catalogApi.categories[0].id + '"]') : null;
    var navigationSection = firstNavigationLink ? firstNavigationLink.closest('section') : null;
    var section = document.getElementById(category.id);
    if (!section) {
      section = createCategorySection(category);
      if (navigationSection) {
        navigationSection.parentNode.insertBefore(section, navigationSection);
      } else {
        document.querySelector('.product-filters').insertAdjacentElement('afterend', section);
      }
    }

    if (firstNavigationLink && !document.querySelector('a[href="#' + category.id + '"]')) {
      var navigationLink = firstNavigationLink.cloneNode(true);
      navigationLink.href = '#' + category.id;
      navigationLink.querySelector('h3').textContent = category.name;
      navigationLink.querySelector('p').textContent = '0 продукта';
      firstNavigationLink.parentNode.appendChild(navigationLink);
    }
    return section;
  }

  function renderCatalog() {
    var page = document.querySelector('.product-filters');
    if (!page) return;
    catalogApi.categories.forEach(function(category) {
      var section = ensureCategoryElements(category);
      var grid = section.querySelector('.cards-grid');
      var products = catalogApi.products.filter(function(product) {
        return product.category === category.id && product.published;
      });
      grid.innerHTML = '';
      products.forEach(function(product) {
        grid.appendChild(createProductCard(product));
      });
      var count = document.querySelector('a[href="#' + category.id + '"] p');
      if (count) count.textContent = products.length + (products.length === 1 ? ' продукт' : ' продукта');
    });
    document.dispatchEvent(new CustomEvent('acorn:products-rendered'));
  }

  function currentProduct() {
    var path = window.location.pathname.indexOf(siteRootPath) === 0 ?
      window.location.pathname.slice(siteRootPath.length) :
      window.location.pathname.replace(/^\/+/, '');
    if (path === 'produkt' || path === 'produkt.html') {
      var id = new URLSearchParams(window.location.search).get('id');
      return catalogApi.products.find(function(product) { return product.id === id && product.published; });
    }
    return catalogApi.products.find(function(product) {
      return product.url === path && product.published;
    });
  }

  function renderProductPage() {
    var detail = document.querySelector('.product-detail');
    if (!detail) return;
    var title = document.querySelector('.product-info h1');
    var imageWrap = document.querySelector('.product-image-large');
    var image = imageWrap ? imageWrap.querySelector('img') : null;
    var prices = document.querySelector('.product-prices-large');
    var callToAction = document.querySelector('.product-cta');
    var product = currentProduct();
    if (!product) {
      title.textContent = 'Продуктът не е наличен';
      if (imageWrap) imageWrap.hidden = true;
      if (prices) prices.hidden = true;
      if (callToAction) callToAction.hidden = true;
      document.querySelectorAll('script[type="application/ld+json"]').forEach(function(schema) {
        if (schema.textContent.indexOf('"@type": "Product"') !== -1) schema.remove();
      });
      document.title = 'Продуктът не е наличен | ACORN';
      document.body.classList.add('product-ready');
      return;
    }
    var currentCrumb = document.querySelector('.breadcrumb-list .current');
    var categoryCrumb = document.querySelector('.breadcrumb-list a[href*="produkti.html#"], .breadcrumb-list a[href*="produkti#"]');
    title.textContent = product.name;
    if (imageWrap) imageWrap.hidden = false;
    image.src = imageUrl(product);
    image.alt = product.name + ' на едро';
    prices.hidden = false;
    if (callToAction) callToAction.hidden = false;
    if (currentCrumb) currentCrumb.textContent = product.name;
    if (categoryCrumb) {
      categoryCrumb.href = new URL('produkti.html#' + product.category, siteRoot).toString();
      categoryCrumb.textContent = categoryName(product.category);
    }
    Array.from(prices.querySelectorAll('.price-row-large')).forEach(function(row) {
      row.remove();
    });
    product.prices.forEach(function(price) {
      prices.appendChild(createPriceRow(price, true));
    });
    if (document.body.classList.contains('dynamic-product-template')) {
      document.title = product.name + ' на едро | ACORN';
      document.body.classList.add('product-ready');
    }
  }

  catalogApi.searchProducts = function() {
    if (!catalogApi.products) return null;
    return catalogApi.products.filter(function(product) { return product.published; }).map(function(product) {
      return {
        name: product.name,
        cat: categoryName(product.category),
        url: product.url
      };
    });
  };

  catalogApi.loading = fetch(dataUrl, { cache: 'no-store' }).then(function(response) {
    if (!response.ok) throw new Error('Неуспешно зареждане на продуктовия каталог.');
    return response.json();
  }).then(function(data) {
    catalogApi.products = data.products || [];
    catalogApi.categories = data.categories || [];
    renderCategoryPanels();
    renderHomeCategories();
    renderProductCategoryLinks();
    renderCatalog();
    renderProductPage();
    return data;
  }).catch(function() {
    if (document.body.classList.contains('dynamic-product-template')) {
      document.querySelector('.product-info h1').textContent = 'Продуктът не може да бъде зареден';
      document.body.classList.add('product-ready');
    }
  });
})();
