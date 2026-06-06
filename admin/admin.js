(function() {
  'use strict';

  var catalog;
  var selectedId = '';
  var isNew = false;
  var selectedCategory = 'all';
  var pendingImage = null;
  var imageProcessing = null;
  var previewObjectUrl = '';
  var loginPanel = document.getElementById('login-panel');
  var editorPanel = document.getElementById('editor-panel');
  var loginStatus = document.getElementById('login-status');
  var editorStatus = document.getElementById('editor-status');
  var workspace = document.getElementById('editor-panel');
  var form = document.getElementById('product-form');
  var fields = document.getElementById('product-fields');
  var productList = document.getElementById('product-list');
  var priceRows = document.getElementById('price-rows');
  var priceTemplate = document.getElementById('price-template');
  var categorySelect = document.getElementById('category-select');
  var deleteProductButton = document.getElementById('delete-product-button');
  var categoryForm = document.getElementById('category-form');
  var categoryNameInput = document.getElementById('category-name');
  var categoryIdInput = document.getElementById('category-id');
  var categoryStatus = document.getElementById('category-status');
  var imageInput = document.getElementById('image-upload');
  var imagePreview = document.getElementById('image-preview');
  var imageUploadStatus = document.getElementById('image-upload-status');
  var EUR_TO_BGN = 1.95583;
  var PRODUCT_IMAGE_SIZE = 800;
  var API = {
    catalog: '../api/products.php',
    login: '../api/admin/login.php',
    logout: '../api/admin/logout.php',
    products: '../api/admin/products.php',
    session: '../api/admin/session.php',
    upload: '../api/admin/upload.php'
  };

  function status(element, message, error) {
    element.textContent = message || '';
    element.classList.toggle('is-error', !!error);
  }

  function requestError(message, statusCode) {
    var error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }

  function request(url, options) {
    return fetch(url, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, options)).then(function(response) {
      var contentType = response.headers.get('Content-Type') || '';
      return response.text().then(function(body) {
        var data = {};
        if (contentType.includes('application/json')) {
          try {
            data = body ? JSON.parse(body) : {};
          } catch (error) {
            throw requestError('Админ API върна невалидни данни. Проверете PHP конфигурацията на хостинга.', response.status);
          }
        } else {
          throw requestError('Админ API не е достъпно. Качете папка `api/` и проверете дали хостингът изпълнява PHP.', response.status);
        }
        if (!response.ok) throw requestError(data.error || 'Заявката бе отказана (HTTP ' + response.status + ').', response.status);
        return data;
      });
    }).catch(function(error) {
      if (error.statusCode) throw error;
      throw requestError('Няма връзка с админ API. Проверете дали PHP е активен на хостинга.', 0);
    });
  }

  function categoryName(id) {
    var match = catalog.categories.find(function(category) { return category.id === id; });
    return match ? match.name : id;
  }

  function showMobileView(view) {
    var changed = workspace.dataset.mobileView !== view;
    workspace.dataset.mobileView = view;
    var productsButton = document.getElementById('show-products-button');
    var editorButton = document.getElementById('show-editor-button');
    var productsActive = view === 'products';
    productsButton.classList.toggle('active', productsActive);
    editorButton.classList.toggle('active', !productsActive);
    productsButton.setAttribute('aria-pressed', String(productsActive));
    editorButton.setAttribute('aria-pressed', String(!productsActive));
    if (changed && window.matchMedia('(max-width: 850px)').matches) {
      workspace.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }

  function slugify(value) {
    var map = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'ts', ч:'ch', ш:'sh', щ:'sht', ъ:'a', ь:'y', ю:'yu', я:'ya' };
    return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split('').map(function(char) {
      return map[char] || char;
    }).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function updateGeneratedId() {
    if (isNew) form.elements.id.value = slugify(form.elements.name.value);
  }

  function parseDecimal(value) {
    var match = String(value).trim().replace(',', '.').match(/^\d+(?:\.\d+)?$/);
    if (!match) return null;
    var amount = Number(match[0]);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  function priceNumber(value) {
    var match = String(value).replace(',', '.').match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function parsePortion(size) {
    var text = String(size || '').toLowerCase();
    var packageMatch = text.match(/^(пакет|чувал|кашон)/);
    var weightMatch = text.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(кг|гр)/);
    var kilograms = weightMatch ? Number(weightMatch[1]) : 1;
    if (weightMatch && weightMatch[2] === 'гр') {
      kilograms = kilograms < 1 ? kilograms : kilograms / 1000;
    }
    return {
      packageName: packageMatch ? packageMatch[1] : 'пакет',
      kilograms: kilograms > 0 ? kilograms : 1
    };
  }

  function weightLabel(kilograms) {
    if (kilograms < 1) return Math.round(kilograms * 1000) + ' гр';
    return String(Number(kilograms.toFixed(3))) + ' кг';
  }

  function updatePriceRow(row) {
    var packageName = row.querySelector('.price-package').value;
    var kilograms = parseDecimal(row.querySelector('.price-weight').value);
    var euroPerKilo = parseDecimal(row.querySelector('.price-per-kilo').value);
    var sizeInput = row.querySelector('.price-size');
    var eurInput = row.querySelector('.price-eur');
    var bgnInput = row.querySelector('.price-bgn');
    var totalEurInput = row.querySelector('.price-total-eur');
    var totalBgnInput = row.querySelector('.price-total-bgn');
    sizeInput.value = kilograms ? packageName + ' ' + weightLabel(kilograms) : '';
    if (!kilograms || !euroPerKilo) {
      eurInput.value = '';
      bgnInput.value = '';
      totalEurInput.value = '';
      totalBgnInput.value = '';
      return;
    }
    var suffix = '/кг';
    eurInput.value = euroPerKilo.toFixed(2) + ' €' + suffix;
    bgnInput.value = (euroPerKilo * EUR_TO_BGN).toFixed(2) + ' лв' + suffix;
    totalEurInput.value = (euroPerKilo * kilograms).toFixed(2) + ' €';
    totalBgnInput.value = (euroPerKilo * kilograms * EUR_TO_BGN).toFixed(2) + ' лв';
  }

  function createPriceRow(price) {
    var row = priceTemplate.content.firstElementChild.cloneNode(true);
    var packageInput = row.querySelector('.price-package');
    var weightInput = row.querySelector('.price-weight');
    var priceInput = row.querySelector('.price-per-kilo');
    if (price) {
      var portion = parsePortion(price.size);
      var listedEuro = priceNumber(price.eur);
      var listedPerKilo = /\/кг/i.test(price.eur);
      packageInput.value = portion.packageName;
      weightInput.value = String(Number(portion.kilograms.toFixed(3)));
      priceInput.value = listedEuro === null ? '' :
        ((!listedPerKilo && portion.kilograms < 1 ? listedEuro / portion.kilograms : listedEuro).toFixed(2));
    }
    [packageInput, weightInput, priceInput].forEach(function(input) {
      input.addEventListener('input', function() { updatePriceRow(row); });
      input.addEventListener('change', function() { updatePriceRow(row); });
    });
    updatePriceRow(row);
    row.querySelector('.remove-price').addEventListener('click', function() {
      if (priceRows.children.length > 1) row.remove();
    });
    priceRows.appendChild(row);
  }

  function setImagePreview(imagePath, file) {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = '';
    }
    if (file) {
      previewObjectUrl = URL.createObjectURL(file);
      imagePreview.src = previewObjectUrl;
      imagePreview.hidden = false;
      imageUploadStatus.textContent = file.name + ' - ще се качи при запис.';
      return;
    }
    if (imagePath) {
      imagePreview.src = '../' + imagePath;
      imagePreview.hidden = false;
      imageUploadStatus.textContent = 'Текуща снимка';
      return;
    }
    imagePreview.removeAttribute('src');
    imagePreview.hidden = true;
    imageUploadStatus.textContent = 'JPG, PNG или WEBP до 5 MB.';
  }

  function renderCategorySelect(selectedValue) {
    var value = selectedValue || categorySelect.value;
    categorySelect.innerHTML = '';
    catalog.categories.forEach(function(category) {
      var option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      categorySelect.appendChild(option);
    });
    if (value && catalog.categories.some(function(category) { return category.id === value; })) {
      categorySelect.value = value;
    }
  }

  function renderCategoryFilters() {
    var container = document.getElementById('category-filters');
    var categories = [{ id: 'all', name: 'Всички' }].concat(catalog.categories);
    container.innerHTML = '';
    categories.forEach(function(category) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'category-filter' + (selectedCategory === category.id ? ' active' : '');
      button.textContent = category.name;
      button.addEventListener('click', function() {
        selectedCategory = category.id;
        renderCategoryFilters();
        renderList();
      });
      container.appendChild(button);
    });
  }

  function hideCategoryForm() {
    categoryForm.reset();
    categoryIdInput.value = '';
    categoryForm.hidden = true;
  }

  function showCategoryForm() {
    hideCategoryForm();
    categoryForm.hidden = false;
    status(categoryStatus, '');
    categoryNameInput.focus();
  }

  function saveCategory(event) {
    event.preventDefault();
    var name = categoryNameInput.value.trim();
    var id = slugify(name);
    categoryIdInput.value = id;
    if (!id) {
      status(categoryStatus, 'Въведете име, от което да се създаде URL адрес.', true);
      return;
    }
    var duplicate = catalog.categories.some(function(category) {
      return category.id === id || category.name.toLowerCase() === name.toLowerCase();
    });
    if (duplicate) {
      status(categoryStatus, 'Тази категория вече съществува.', true);
      return;
    }
    var categories = catalog.categories.concat([{ id: id, name: name }]);
    status(categoryStatus, 'Записване...');
    request(API.products, {
      method: 'POST',
      body: JSON.stringify({ categories: categories, products: catalog.products })
    }).then(function(updated) {
      catalog = updated;
      renderCategorySelect(isNew ? id : form.elements.category.value);
      renderCategoryFilters();
      renderList();
      hideCategoryForm();
      status(categoryStatus, 'Категорията "' + name + '" е добавена.');
    }).catch(function(error) {
      status(categoryStatus, error.message, true);
    });
  }

  function renderList() {
    var query = document.getElementById('admin-search').value.toLowerCase().trim();
    productList.innerHTML = '';
    var products = catalog.products.filter(function(product) {
      var matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
      var matchesQuery = !query || product.name.toLowerCase().includes(query) || categoryName(product.category).toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
    products.forEach(function(product) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'product-select' + (product.id === selectedId ? ' active' : '') + (product.published ? '' : ' is-hidden');
      var name = document.createElement('strong');
      name.textContent = product.name;
      var category = document.createElement('span');
      category.textContent = categoryName(product.category);
      button.appendChild(name);
      button.appendChild(category);
      button.addEventListener('click', function() { selectProduct(product.id); });
      productList.appendChild(button);
    });
    document.getElementById('catalog-count').textContent = catalog.products.length + ' артикула';
  }

  function setPreview(product) {
    var link = document.getElementById('preview-link');
    if (!product) {
      link.hidden = true;
      return;
    }
    link.href = '../' + product.url;
    link.hidden = false;
  }

  function selectProduct(id, keepMobileView) {
    var product = catalog.products.find(function(item) { return item.id === id; });
    if (!product) return;
    selectedId = id;
    isNew = false;
    fields.disabled = false;
    deleteProductButton.hidden = false;
    deleteProductButton.disabled = false;
    document.getElementById('mode-label').textContent = 'Редакция';
    document.getElementById('form-title').textContent = product.name;
    form.elements.name.value = product.name;
    form.elements.id.value = product.id;
    form.elements.category.value = product.category;
    form.elements.image.value = product.image;
    form.elements.published.checked = product.published;
    pendingImage = null;
    imageProcessing = null;
    imageInput.value = '';
    setImagePreview(product.image);
    priceRows.innerHTML = '';
    product.prices.forEach(createPriceRow);
    setPreview(product);
    status(editorStatus, '');
    renderList();
    if (!keepMobileView) showMobileView('editor');
  }

  function newProduct() {
    selectedId = '';
    isNew = true;
    fields.disabled = false;
    deleteProductButton.hidden = true;
    deleteProductButton.disabled = false;
    form.reset();
    form.elements.id.value = '';
    pendingImage = null;
    imageProcessing = null;
    imageInput.value = '';
    setImagePreview('');
    document.getElementById('mode-label').textContent = 'Нов артикул';
    document.getElementById('form-title').textContent = 'Добавяне на продукт';
    priceRows.innerHTML = '';
    createPriceRow();
    setPreview(null);
    status(editorStatus, '');
    renderList();
    showMobileView('editor');
    form.elements.name.focus({ preventScroll: true });
  }

  function getPrices() {
    return Array.from(priceRows.querySelectorAll('.price-editor'), function(row) {
      return {
        size: row.querySelector('.price-size').value.trim(),
        eur: row.querySelector('.price-eur').value.trim(),
        bgn: row.querySelector('.price-bgn').value.trim()
      };
    });
  }

  function persistProduct(imagePath) {
    var id = isNew ? slugify(form.elements.name.value) : form.elements.id.value.trim();
    form.elements.id.value = id;
    if (!id) {
      status(editorStatus, 'Въведете име, от което да се създаде URL адрес.', true);
      return Promise.resolve();
    }
    var existing = catalog.products.find(function(item) { return item.id === selectedId; });
    var product = {
      id: id,
      name: form.elements.name.value.trim(),
      category: form.elements.category.value,
      image: imagePath,
      url: existing ? existing.url : 'produkti/' + form.elements.category.value + '/' + id,
      published: form.elements.published.checked,
      prices: getPrices()
    };
    var next = catalog.products.slice();
    if (existing) {
      next[next.indexOf(existing)] = product;
    } else {
      next.push(product);
    }
    status(editorStatus, 'Записване...');
    return request(API.products, {
      method: 'POST',
      body: JSON.stringify({ categories: catalog.categories, products: next })
    }).then(function(updated) {
      catalog = updated;
      selectedId = product.id;
      selectProduct(product.id);
      status(editorStatus, 'Промените са публикувани.');
    }).catch(function(error) {
      status(editorStatus, error.message, true);
    });
  }

  function fileAsBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() {
        resolve(String(reader.result).split(',')[1] || '');
      };
      reader.onerror = function() {
        reject(new Error('Снимката не може да бъде прочетена.'));
      };
      reader.readAsDataURL(file);
    });
  }

  function standardizeProductImage(file) {
    return new Promise(function(resolve, reject) {
      var source = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function() {
        URL.revokeObjectURL(source);
        var canvas = document.createElement('canvas');
        canvas.width = PRODUCT_IMAGE_SIZE;
        canvas.height = PRODUCT_IMAGE_SIZE;
        var context = canvas.getContext('2d');
        var scale = Math.min(PRODUCT_IMAGE_SIZE / image.naturalWidth, PRODUCT_IMAGE_SIZE / image.naturalHeight);
        var width = image.naturalWidth * scale;
        var height = image.naturalHeight * scale;
        context.clearRect(0, 0, PRODUCT_IMAGE_SIZE, PRODUCT_IMAGE_SIZE);
        context.drawImage(image, (PRODUCT_IMAGE_SIZE - width) / 2, (PRODUCT_IMAGE_SIZE - height) / 2, width, height);
        canvas.toBlob(function(blob) {
          if (!blob) {
            reject(new Error('Снимката не може да бъде оразмерена.'));
            return;
          }
          var baseName = file.name.replace(/\.[^.]+$/, '') || 'produkt';
          resolve(new File([blob], baseName + '.webp', { type: 'image/webp' }));
        }, 'image/webp', 0.88);
      };
      image.onerror = function() {
        URL.revokeObjectURL(source);
        reject(new Error('Снимката не може да бъде отворена.'));
      };
      image.src = source;
    });
  }

  function uploadSelectedImage() {
    var file = pendingImage;
    status(editorStatus, 'Качване на снимка...');
    return fileAsBase64(file).then(function(data) {
      return request(API.upload, {
        method: 'POST',
        body: JSON.stringify({ name: file.name, type: file.type, data: data })
      });
    }).then(function(result) {
      pendingImage = null;
      imageInput.value = '';
      form.elements.image.value = result.path;
      setImagePreview(result.path);
      return result.path;
    });
  }

  function saveProduct(event) {
    event.preventDefault();
    if (isNew && !slugify(form.elements.name.value)) {
      status(editorStatus, 'Въведете име, от което да се създаде URL адрес.', true);
      form.elements.name.focus();
      return;
    }
    if (imageProcessing) {
      status(editorStatus, 'Подготовка на снимката...');
      imageProcessing.then(function() {
        if (pendingImage) saveProduct(event);
      }).catch(function(error) {
        status(editorStatus, error.message, true);
      });
      return;
    }
    if (pendingImage) {
      uploadSelectedImage().then(persistProduct).catch(function(error) {
        status(editorStatus, error.message, true);
      });
      return;
    }
    persistProduct(form.elements.image.value.trim());
  }

  function deleteProduct() {
    var product = catalog.products.find(function(item) { return item.id === selectedId; });
    if (!product || isNew) return;
    if (!window.confirm('Сигурни ли сте, че искате да изтриете артикула "' + product.name + '"? Той няма да се показва в сайта.')) {
      return;
    }
    var next = catalog.products.filter(function(item) { return item.id !== product.id; });
    deleteProductButton.disabled = true;
    status(editorStatus, 'Изтриване...');
    request(API.products, {
      method: 'POST',
      body: JSON.stringify({ categories: catalog.categories, products: next })
    }).then(function(updated) {
      catalog = updated;
      selectedId = '';
      if (catalog.products.length) {
        selectProduct(catalog.products[0].id, true);
      } else {
        fields.disabled = true;
        form.reset();
        priceRows.innerHTML = '';
        setImagePreview('');
        setPreview(null);
        deleteProductButton.hidden = true;
        document.getElementById('form-title').textContent = 'Няма артикули';
        renderList();
      }
      status(editorStatus, 'Артикулът "' + product.name + '" е изтрит.');
    }).catch(function(error) {
      deleteProductButton.disabled = false;
      status(editorStatus, error.message, true);
    });
  }

  function openEditor() {
    return request(API.catalog).then(function(data) {
      catalog = data;
      renderCategorySelect();
      renderCategoryFilters();
      loginPanel.hidden = true;
      editorPanel.hidden = false;
      document.getElementById('logout-button').hidden = false;
      showMobileView('products');
      renderList();
      if (catalog.products.length) selectProduct(catalog.products[0].id, true);
    });
  }

  document.getElementById('login-form').addEventListener('submit', function(event) {
    event.preventDefault();
    status(loginStatus, 'Вход...');
    request(API.login, {
      method: 'POST',
      body: JSON.stringify({ password: document.getElementById('admin-password').value })
    }).then(openEditor).catch(function(error) {
      status(loginStatus, error.message, true);
    });
  });

  document.getElementById('logout-button').addEventListener('click', function() {
    request(API.logout, { method: 'POST', body: '{}' }).finally(function() {
      location.reload();
    });
  });
  document.getElementById('show-password-button').addEventListener('click', function() {
    var input = document.getElementById('admin-password');
    var reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    this.textContent = reveal ? 'Скрий' : 'Покажи';
  });
  document.getElementById('show-products-button').addEventListener('click', function() { showMobileView('products'); });
  document.getElementById('show-editor-button').addEventListener('click', function() { showMobileView('editor'); });
  document.getElementById('new-product-button').addEventListener('click', newProduct);
  document.getElementById('new-category-button').addEventListener('click', showCategoryForm);
  document.getElementById('cancel-category-button').addEventListener('click', function() {
    hideCategoryForm();
    status(categoryStatus, '');
  });
  categoryNameInput.addEventListener('input', function() {
    categoryIdInput.value = slugify(this.value);
  });
  categoryForm.addEventListener('submit', saveCategory);
  document.getElementById('add-price-button').addEventListener('click', function() { createPriceRow(); });
  deleteProductButton.addEventListener('click', deleteProduct);
  document.getElementById('cancel-button').addEventListener('click', function() {
    if (selectedId) selectProduct(selectedId);
    else newProduct();
  });
  document.getElementById('admin-search').addEventListener('input', renderList);
  imageInput.addEventListener('change', function() {
    var file = this.files[0];
    var types = ['image/jpeg', 'image/png', 'image/webp'];
    if (!file) {
      pendingImage = null;
      imageProcessing = null;
      setImagePreview(form.elements.image.value.trim());
      return;
    }
    if (!types.includes(file.type) || file.size > 5 * 1024 * 1024) {
      pendingImage = null;
      imageProcessing = null;
      this.value = '';
      setImagePreview(form.elements.image.value.trim());
      status(editorStatus, 'Изберете снимка JPG, PNG или WEBP до 5 MB.', true);
      return;
    }
    pendingImage = null;
    status(editorStatus, 'Подготовка на снимката...');
    imageProcessing = standardizeProductImage(file).then(function(standardizedFile) {
      pendingImage = standardizedFile;
      imageProcessing = null;
      setImagePreview('', standardizedFile);
      imageUploadStatus.textContent = standardizedFile.name + ' - 800 x 800 px, ще се качи при запис.';
      status(editorStatus, '');
      return standardizedFile;
    }).catch(function(error) {
      pendingImage = null;
      imageProcessing = null;
      imageInput.value = '';
      setImagePreview(form.elements.image.value.trim());
      status(editorStatus, error.message, true);
      return null;
    });
  });
  form.elements.image.addEventListener('change', function() {
    if (!pendingImage) setImagePreview(this.value.trim());
  });
  form.addEventListener('submit', saveProduct);
  form.elements.name.addEventListener('input', updateGeneratedId);

  request(API.session).then(openEditor).catch(function(error) {
    loginPanel.hidden = false;
    if (error.statusCode !== 401) status(loginStatus, error.message, true);
  });
})();
