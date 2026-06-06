'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'products.json');
const SITEMAP_FILE = path.join(ROOT, 'sitemap.xml');
const PRODUCT_TEMPLATE_FILE = path.join(ROOT, 'produkt.html');
const UPLOAD_DIR = path.join(ROOT, 'images', 'uploads');
const ENV_FILE = path.join(ROOT, '.env');
const MAX_JSON_BODY = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PHP_API_ALIASES = {
  '/api/products.php': '/api/products',
  '/api/admin/login.php': '/api/admin/login',
  '/api/admin/logout.php': '/api/admin/logout',
  '/api/admin/products.php': '/api/admin/products',
  '/api/admin/session.php': '/api/admin/session',
  '/api/admin/upload.php': '/api/admin/upload'
};

function loadLocalEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) return;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  });
}

loadLocalEnv();
const ADMIN_PASSWORD = process.env.ACORN_ADMIN_PASSWORD || '';
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const sessions = new Map();
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function addSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function respondJson(res, status, value) {
  addSecurityHeaders(res);
  res.writeHead(status, {
    'Content-Type': CONTENT_TYPES['.json'],
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_JSON_BODY) {
        reject(new Error('Твърде голяма заявка.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Невалиден JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function secureEqual(left, right) {
  const a = crypto.createHash('sha256').update(left).digest();
  const b = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(a, b);
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((item) => {
    const separator = item.indexOf('=');
    return [item.slice(0, separator).trim(), item.slice(separator + 1).trim()];
  }));
}

function authenticated(req) {
  const token = cookies(req).acorn_admin;
  const expiresAt = token && sessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + SESSION_MAX_AGE);
  return true;
}

function requireAdmin(req, res) {
  if (!authenticated(req)) {
    respondJson(res, 401, { error: 'Необходим е администраторски вход.' });
    return false;
  }
  return true;
}

function validateCatalog(input) {
  const source = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!input || !Array.isArray(input.products) || input.products.length > 500) {
    throw new Error('Каталогът съдържа невалиден списък с продукти.');
  }
  const suppliedCategories = Object.prototype.hasOwnProperty.call(input, 'categories');
  if (suppliedCategories && !Array.isArray(input.categories)) {
    throw new Error('Каталогът съдържа невалиден списък с категории.');
  }
  const rawCategories = suppliedCategories ? input.categories : source.categories;
  if (!Array.isArray(rawCategories) || !rawCategories.length || rawCategories.length > 50) {
    throw new Error('Каталогът съдържа невалиден списък с категории.');
  }

  const categoryIds = new Set();
  const categories = rawCategories.map((raw, index) => {
    const category = raw || {};
    const id = String(category.id || '').trim();
    const name = String(category.name || '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || categoryIds.has(id)) {
      throw new Error(`Категория ${index + 1} има невалиден или повторен идентификатор.`);
    }
    if (!name || name.length > 80) {
      throw new Error(`Категория "${id}" има невалидно име.`);
    }
    categoryIds.add(id);
    return { id, name };
  });

  const ids = new Set();
  const products = input.products.map((raw, index) => {
    const item = raw || {};
    const id = String(item.id || '').trim();
    const name = String(item.name || '').trim();
    const category = String(item.category || '').trim();
    const image = String(item.image || '').trim();
    const url = String(item.url || '').trim();

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id)) {
      throw new Error(`Продукт ${index + 1} има невалиден или повторен идентификатор.`);
    }
    ids.add(id);
    if (!name || name.length > 120 || !categoryIds.has(category)) {
      throw new Error(`Продукт "${name || id}" има невалидно име или категория.`);
    }
    if (!/^images\/[A-Za-z0-9._/-]+$/.test(image) || image.includes('..')) {
      throw new Error(`Продукт "${name}" има невалиден път до изображение.`);
    }
    const existingUrl = new RegExp(`^produkti/(?:${Array.from(categoryIds).join('|')})/${id}$`);
    if (!existingUrl.test(url)) {
      throw new Error(`Продукт "${name}" има невалиден адрес.`);
    }
    if (!Array.isArray(item.prices) || item.prices.length > 10) {
      throw new Error(`Продукт "${name}" съдържа невалиден списък с цени.`);
    }

    const prices = item.prices.map((price) => {
      const size = String(price.size || '').trim();
      const eur = String(price.eur || '').trim();
      const bgn = String(price.bgn || '').trim();
      if (!size || !eur || !bgn || size.length > 80 || eur.length > 40 || bgn.length > 40) {
        throw new Error(`Продукт "${name}" съдържа непълна цена.`);
      }
      return { size, eur, bgn };
    });

    return {
      id,
      name,
      category,
      image,
      url,
      published: item.published !== false,
      prices
    };
  });

  return {
    version: source.version,
    updatedAt: new Date().toISOString(),
    categories,
    products
  };
}

function saveCatalog(catalog) {
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, DATA_FILE);
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function productCanonical(product) {
  return `https://acorn-bg.com/${product.url}`;
}

function replaceMeta(html, attribute, name, value) {
  const expression = new RegExp(`<meta ${attribute}="${name}" content="[^"]*">`);
  return html.replace(expression, `<meta ${attribute}="${name}" content="${escapeHtml(value)}">`);
}

function productSchema(catalog, product) {
  const category = catalog.categories.find((item) => item.id === product.category);
  const canonical = productCanonical(product);
  const numericPrices = product.prices.map((price) => Number((price.eur.match(/\d+(?:[.,]\d+)?/) || ['0'])[0].replace(',', '.')));
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: `${product.name} на едро. Производство и доставка. АС Трейд Къмпани ЕООД.`,
    url: canonical,
    brand: { '@type': 'Brand', name: 'ACORN' },
    category: category ? category.name : product.category,
    seller: { '@type': 'Organization', name: 'АС Трейд Къмпани ЕООД', url: 'https://acorn-bg.com' },
    image: `https://acorn-bg.com/${product.image}`
  };
  if (numericPrices.length) {
    data.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'EUR',
      lowPrice: String(Math.min(...numericPrices)),
      highPrice: String(Math.max(...numericPrices)),
      offerCount: product.prices.length,
      offers: product.prices.map((price, index) => ({
        '@type': 'Offer',
        priceCurrency: 'EUR',
        price: String(numericPrices[index]),
        description: price.size,
        availability: 'https://schema.org/InStock',
        url: canonical
      }))
    };
  }
  return data;
}

function breadcrumbSchema(catalog, product) {
  const category = catalog.categories.find((item) => item.id === product.category);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Начало', item: 'https://acorn-bg.com' },
      { '@type': 'ListItem', position: 2, name: 'Продукти', item: 'https://acorn-bg.com/produkti.html' },
      { '@type': 'ListItem', position: 3, name: category ? category.name : product.category, item: `https://acorn-bg.com/produkti.html#${product.category}` },
      { '@type': 'ListItem', position: 4, name: product.name, item: productCanonical(product) }
    ]
  };
}

function applyProductSeo(html, catalog, product) {
  const category = catalog.categories.find((item) => item.id === product.category);
  const description = `${product.name} на едро. ${category ? category.name : product.category}. ACORN - АС ТРЕЙД КЪМПАНИ ЕООД, Тържище София.`;
  const canonical = productCanonical(product);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(product.name)} на едро | ACORN</title>`);
  html = replaceMeta(html, 'name', 'description', description);
  if (/<meta name="robots" content="[^"]*">/.test(html)) {
    html = html.replace(/\s*<meta name="robots" content="[^"]*">/, `\n  <link rel="canonical" href="${escapeHtml(canonical)}">`);
  } else if (/<link rel="canonical" href="[^"]*">/.test(html)) {
    html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escapeHtml(canonical)}">`);
  }
  html = replaceMeta(html, 'property', 'og:url', canonical);
  html = replaceMeta(html, 'property', 'og:title', `${product.name} на едро | ACORN`);
  html = replaceMeta(html, 'property', 'og:description', description);
  html = replaceMeta(html, 'property', 'og:image', `https://acorn-bg.com/${product.image}`);
  html = replaceMeta(html, 'name', 'twitter:title', `${product.name} на едро | ACORN`);
  html = replaceMeta(html, 'name', 'twitter:description', description);
  html = replaceMeta(html, 'name', 'twitter:image', `https://acorn-bg.com/${product.image}`);
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, (block) => {
    if (block.includes('"@type": "BreadcrumbList"')) {
      return `<script type="application/ld+json">\n${JSON.stringify(breadcrumbSchema(catalog, product), null, 2)}\n  </script>`;
    }
    if (block.includes('"@type": "Product"')) {
      return `<script type="application/ld+json">\n${JSON.stringify(productSchema(catalog, product), null, 2)}\n  </script>`;
    }
    return block;
  });
  return html;
}

function renderProductPriceRows(product) {
  return product.prices.map((price) => [
    '              <div class="price-row-large">',
    `                <span class="size">${escapeHtml(price.size)}</span>`,
    '                <span class="price">',
    `                  <span class="eur">${escapeHtml(price.eur)}</span>`,
    `                  <span class="bgn">/ ${escapeHtml(price.bgn)}</span>`,
    '                </span>',
    '              </div>'
  ].join('\n')).join('\n');
}

function applyProductContent(html, catalog, product, relativePrefix) {
  const category = catalog.categories.find((item) => item.id === product.category);
  const categoryLabel = category ? category.name : product.category;
  const image = `${relativePrefix}${product.image}`;
  const catalogPage = `${relativePrefix}produkti.html`;
  html = html.replace(/(<link rel="preload" as="image" href=")[^"]*(">[\r\n]+\s*<link rel="preconnect")/, (_match, start, end) => `${start}${escapeHtml(image)}${end}`);
  html = html.replace(/<li><a href="(?:\.\.\/\.\.\/)?produkti(?:\.html)?#[^"]+">[^<]*<\/a><\/li>\s*<li class="separator">›<\/li>\s*<li class="current">[^<]*<\/li>/, `<li><a href="${escapeHtml(catalogPage)}#${escapeHtml(product.category)}">${escapeHtml(categoryLabel)}</a></li>\n        <li class="separator">›</li>\n        <li class="current">${escapeHtml(product.name)}</li>`);
  html = html.replace(/(<div class="product-image-large">\s*)<img src="[^"]*" alt="[^"]*" loading="lazy">/, `$1<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)} на едро" loading="lazy">`);
  html = html.replace(/(<div class="product-info">\s*<h1>)[\s\S]*?(<\/h1>)/, `$1${escapeHtml(product.name)}$2`);
  html = html.replace(/(<div class="product-prices-large">\s*<h3>[\s\S]*?<\/h3>)[\s\S]*?(\s*<\/div>\s*<div class="product-cta">)/, (_match, start, end) => `${start}\n${renderProductPriceRows(product)}${end}`);
  return html;
}

function renderGeneratedProductPage(catalog, product) {
  let html = fs.readFileSync(PRODUCT_TEMPLATE_FILE, 'utf8');
  html = html.replace('<head>', '<head>\n  <base href="../../">');
  html = applyProductSeo(html, catalog, product);
  html = applyProductContent(html, catalog, product, '');
  return `<!-- ACORN GENERATED PRODUCT PAGE -->\n${html}`;
}

function generatedProductFile(product) {
  return /^produkti\/[a-z0-9-]+\/[a-z0-9-]+$/.test(product.url) ? path.join(ROOT, `${product.url}.html`) : null;
}

function isGeneratedFile(file) {
  return fs.existsSync(file) && fs.readFileSync(file, 'utf8').startsWith('<!-- ACORN GENERATED PRODUCT PAGE -->');
}

function writeFileAtomically(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, file);
}

function saveSitemap(catalog) {
  const date = String(catalog.updatedAt).slice(0, 10);
  const pages = [
    ['https://acorn-bg.com/', 'monthly', '1.0'],
    ['https://acorn-bg.com/produkti.html', 'weekly', '0.9'],
    ['https://acorn-bg.com/za-nas', 'monthly', '0.7'],
    ['https://acorn-bg.com/kontakti', 'monthly', '0.7'],
    ['https://acorn-bg.com/obshti-usloviya', 'yearly', '0.3']
  ].concat(catalog.products.filter((product) => product.published).map((product) => [productCanonical(product), 'weekly', '0.7']));
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    .concat(pages.map(([url, frequency, priority]) => `  <url>\n    <loc>${escapeHtml(url)}</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>${frequency}</changefreq>\n    <priority>${priority}</priority>\n  </url>`))
    .concat(['</urlset>', '']).join('\n');
  writeFileAtomically(SITEMAP_FILE, xml);
}

function publishCatalog(catalog, previousCatalog) {
  const categoriesChanged = JSON.stringify(catalog.categories) !== JSON.stringify(previousCatalog.categories || []);
  catalog.products.forEach((product) => {
    const file = generatedProductFile(product);
    if (!file) return;
    const previous = (previousCatalog.products || []).find((item) => item.id === product.id);
    const productChanged = !previous || JSON.stringify(product) !== JSON.stringify(previous);
    if (product.published && (!fs.existsSync(file) || isGeneratedFile(file))) {
      writeFileAtomically(file, renderGeneratedProductPage(catalog, product));
    } else if (product.published && (productChanged || categoriesChanged)) {
      const html = fs.readFileSync(file, 'utf8');
      const updated = applyProductContent(applyProductSeo(html, catalog, product), catalog, product, '../../');
      writeFileAtomically(file, updated);
    } else if (!product.published && fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
  (previousCatalog.products || []).forEach((product) => {
    const stillUsed = catalog.products.some((item) => item.url === product.url);
    const file = generatedProductFile(product);
    if (!stillUsed && file && fs.existsSync(file)) fs.unlinkSync(file);
  });
  saveSitemap(catalog);
}

function saveUploadedImage(input) {
  const mimeExtensions = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  };
  const contentType = String(input.type || '').toLowerCase();
  const extension = mimeExtensions[contentType];
  const data = String(input.data || '');
  if (!extension || !/^[A-Za-z0-9+/=\s]+$/.test(data)) {
    throw new Error('Разрешени са изображения JPG, PNG и WEBP.');
  }
  const buffer = Buffer.from(data.replace(/\s+/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Снимката трябва да е до 5 MB.');
  }
  const isJpeg = contentType === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  const isPng = contentType === 'image/png' && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = contentType === 'image/webp' && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) {
    throw new Error('Файлът не е валидно изображение.');
  }
  const originalBase = path.basename(String(input.name || ''), path.extname(String(input.name || '')));
  const safeBase = originalBase.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'produkt';
  const filename = `${safeBase}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}${extension}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `images/uploads/${filename}`;
}

async function handleApi(req, res, pathname) {
  pathname = PHP_API_ALIASES[pathname] || pathname;
  if (pathname === '/api/products' && req.method === 'GET') {
    respondJson(res, 200, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
    return true;
  }

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (!ADMIN_PASSWORD) {
      respondJson(res, 503, { error: 'Сървърът няма зададена ACORN_ADMIN_PASSWORD.' });
      return true;
    }
    const input = await readBody(req);
    if (!secureEqual(String(input.password || '').trim(), ADMIN_PASSWORD)) {
      respondJson(res, 401, { error: 'Грешна парола.' });
      return true;
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_MAX_AGE);
    res.setHeader('Set-Cookie', `acorn_admin=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${SESSION_MAX_AGE / 1000}`);
    respondJson(res, 200, { authenticated: true });
    return true;
  }

  if (pathname === '/api/admin/session' && req.method === 'GET') {
    respondJson(res, authenticated(req) ? 200 : 401, { authenticated: authenticated(req) });
    return true;
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    const token = cookies(req).acorn_admin;
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'acorn_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');
    respondJson(res, 200, { authenticated: false });
    return true;
  }

  if (pathname === '/api/admin/products' && (req.method === 'PUT' || req.method === 'POST')) {
    if (!requireAdmin(req, res)) return true;
    try {
      const previousCatalog = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const catalog = validateCatalog(await readBody(req));
      saveCatalog(catalog);
      publishCatalog(catalog, previousCatalog);
      respondJson(res, 200, catalog);
    } catch (error) {
      respondJson(res, 400, { error: error.message });
    }
    return true;
  }

  if (pathname === '/api/admin/upload' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return true;
    try {
      const imagePath = saveUploadedImage(await readBody(req));
      respondJson(res, 201, { path: imagePath });
    } catch (error) {
      respondJson(res, 400, { error: error.message });
    }
    return true;
  }
  return false;
}

function cleanRedirectPath(pathname) {
  if (pathname === '/index.html') return '/';
  if (pathname.endsWith('/index.html')) return pathname.slice(0, -'index.html'.length);
  if (pathname.endsWith('.html') && pathname !== '/produkti.html') return pathname.slice(0, -'.html'.length);
  if (pathname === '/produkti/') return '/produkti';
  return '';
}

function staticRequestPath(pathname) {
  if (pathname === '/') return '/index.html';
  if (pathname === '/admin' || pathname === '/admin/') return '/admin/index.html';
  if (pathname === '/produkti') return '/produkti.html';
  if (!path.extname(pathname) && !pathname.endsWith('/')) {
    const candidate = path.resolve(ROOT, `.${pathname}.html`);
    if (candidate.startsWith(`${ROOT}${path.sep}`) && fs.existsSync(candidate)) return `${pathname}.html`;
  }
  return pathname;
}

function serveStatic(req, res, pathname) {
  const requestPath = staticRequestPath(pathname);
  const resolved = path.resolve(ROOT, `.${requestPath}`);
  if ((resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) || path.basename(resolved).startsWith('.')) {
    respondJson(res, 404, { error: 'Not found' });
    return;
  }
  fs.stat(resolved, (error, stat) => {
    if (error || !stat.isFile()) {
      respondJson(res, 404, { error: 'Not found' });
      return;
    }
    addSecurityHeaders(res);
    const noCache = requestPath.startsWith('/admin/') || requestPath === '/admin';
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(resolved)] || 'application/octet-stream',
      'Cache-Control': noCache ? 'no-store' : 'public, max-age=300'
    });
    fs.createReadStream(resolved).pipe(res);
  });
}

http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname.startsWith('/api/') && await handleApi(req, res, pathname)) return;
    if (pathname.startsWith('/api/')) {
      respondJson(res, 404, { error: 'Not found' });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      respondJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const destination = cleanRedirectPath(pathname);
    if (destination) {
      addSecurityHeaders(res);
      res.writeHead(301, { Location: `${destination}${requestUrl.search}`, 'Cache-Control': 'public, max-age=3600' });
      res.end();
      return;
    }
    serveStatic(req, res, pathname);
  } catch (error) {
    respondJson(res, 500, { error: 'Възникна сървърна грешка.' });
  }
}).listen(PORT, HOST, () => {
  const adminState = ADMIN_PASSWORD ? 'активен' : 'липсва ACORN_ADMIN_PASSWORD';
  console.log(`ACORN server: http://${HOST}:${PORT} (admin: ${adminState})`);
});
