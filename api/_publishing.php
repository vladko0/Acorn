<?php
declare(strict_types=1);

define('ACORN_PRODUCT_TEMPLATE_FILE', ACORN_ROOT . '/produkt.html');
define('ACORN_SITEMAP_FILE', ACORN_ROOT . '/sitemap.xml');
define('ACORN_GENERATED_MARKER', '<!-- ACORN GENERATED PRODUCT PAGE -->');

function acorn_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function acorn_product_canonical(array $product): string
{
    return 'https://acorn-bg.com/' . $product['url'];
}

function acorn_category_name(array $catalog, string $id): string
{
    foreach ($catalog['categories'] as $category) {
        if (($category['id'] ?? '') === $id) {
            return (string) $category['name'];
        }
    }
    return $id;
}

function acorn_replace_meta(string $html, string $attribute, string $name, string $value): string
{
    $pattern = '#<meta ' . preg_quote($attribute, '#') . '="' . preg_quote($name, '#') . '" content="[^"]*">#';
    return (string) preg_replace_callback($pattern, function () use ($attribute, $name, $value): string {
        return '<meta ' . $attribute . '="' . $name . '" content="' . acorn_escape($value) . '">';
    }, $html, 1);
}

function acorn_numeric_price(string $value): float
{
    if (!preg_match('/\d+(?:[.,]\d+)?/', $value, $match)) {
        return 0.0;
    }
    return (float) str_replace(',', '.', $match[0]);
}

function acorn_product_schema(array $catalog, array $product): array
{
    $canonical = acorn_product_canonical($product);
    $prices = [];
    foreach ($product['prices'] as $price) {
        $prices[] = acorn_numeric_price((string) $price['eur']);
    }
    $schema = [
        '@context' => 'https://schema.org',
        '@type' => 'Product',
        'name' => $product['name'],
        'description' => $product['name'] . ' на едро. Производство и доставка. АС Трейд Къмпани ЕООД.',
        'url' => $canonical,
        'brand' => ['@type' => 'Brand', 'name' => 'ACORN'],
        'category' => acorn_category_name($catalog, (string) $product['category']),
        'seller' => ['@type' => 'Organization', 'name' => 'АС Трейд Къмпани ЕООД', 'url' => 'https://acorn-bg.com'],
        'image' => 'https://acorn-bg.com/' . $product['image'],
    ];
    if ($prices !== []) {
        $offers = [];
        foreach ($product['prices'] as $index => $price) {
            $offers[] = [
                '@type' => 'Offer',
                'priceCurrency' => 'EUR',
                'price' => (string) $prices[$index],
                'description' => $price['size'],
                'availability' => 'https://schema.org/InStock',
                'url' => $canonical,
            ];
        }
        $schema['offers'] = [
            '@type' => 'AggregateOffer',
            'priceCurrency' => 'EUR',
            'lowPrice' => (string) min($prices),
            'highPrice' => (string) max($prices),
            'offerCount' => count($offers),
            'offers' => $offers,
        ];
    }
    return $schema;
}

function acorn_breadcrumb_schema(array $catalog, array $product): array
{
    return [
        '@context' => 'https://schema.org',
        '@type' => 'BreadcrumbList',
        'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => 'Начало', 'item' => 'https://acorn-bg.com'],
            ['@type' => 'ListItem', 'position' => 2, 'name' => 'Продукти', 'item' => 'https://acorn-bg.com/produkti.html'],
            ['@type' => 'ListItem', 'position' => 3, 'name' => acorn_category_name($catalog, (string) $product['category']), 'item' => 'https://acorn-bg.com/produkti.html#' . $product['category']],
            ['@type' => 'ListItem', 'position' => 4, 'name' => $product['name'], 'item' => acorn_product_canonical($product)],
        ],
    ];
}

function acorn_apply_product_seo(string $html, array $catalog, array $product): string
{
    $category = acorn_category_name($catalog, (string) $product['category']);
    $description = $product['name'] . ' на едро. ' . $category . '. ACORN - АС ТРЕЙД КЪМПАНИ ЕООД, Тържище София.';
    $canonical = acorn_product_canonical($product);
    $html = (string) preg_replace_callback('#<title>[\s\S]*?</title>#', function () use ($product): string {
        return '<title>' . acorn_escape((string) $product['name']) . ' на едро | ACORN</title>';
    }, $html, 1);
    $html = acorn_replace_meta($html, 'name', 'description', $description);
    if (preg_match('#<meta name="robots" content="[^"]*">#', $html)) {
        $html = (string) preg_replace_callback('#\s*<meta name="robots" content="[^"]*">#', function () use ($canonical): string {
            return PHP_EOL . '  <link rel="canonical" href="' . acorn_escape($canonical) . '">';
        }, $html, 1);
    } elseif (preg_match('#<link rel="canonical" href="[^"]*">#', $html)) {
        $html = (string) preg_replace_callback('#<link rel="canonical" href="[^"]*">#', function () use ($canonical): string {
            return '<link rel="canonical" href="' . acorn_escape($canonical) . '">';
        }, $html, 1);
    }
    $html = acorn_replace_meta($html, 'property', 'og:url', $canonical);
    $html = acorn_replace_meta($html, 'property', 'og:title', $product['name'] . ' на едро | ACORN');
    $html = acorn_replace_meta($html, 'property', 'og:description', $description);
    $html = acorn_replace_meta($html, 'property', 'og:image', 'https://acorn-bg.com/' . $product['image']);
    $html = acorn_replace_meta($html, 'name', 'twitter:title', $product['name'] . ' на едро | ACORN');
    $html = acorn_replace_meta($html, 'name', 'twitter:description', $description);
    $html = acorn_replace_meta($html, 'name', 'twitter:image', 'https://acorn-bg.com/' . $product['image']);
    $html = (string) preg_replace_callback('#<script type="application/ld\+json">[\s\S]*?</script>#', function (array $matches) use ($catalog, $product): string {
        if (strpos($matches[0], '"@type": "BreadcrumbList"') !== false) {
            return '<script type="application/ld+json">' . PHP_EOL . json_encode(acorn_breadcrumb_schema($catalog, $product), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL . '  </script>';
        }
        if (strpos($matches[0], '"@type": "Product"') !== false) {
            return '<script type="application/ld+json">' . PHP_EOL . json_encode(acorn_product_schema($catalog, $product), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL . '  </script>';
        }
        return $matches[0];
    }, $html);
    return $html;
}

function acorn_render_product_price_rows(array $product): string
{
    $rows = [];
    foreach ($product['prices'] as $price) {
        $rows[] = '              <div class="price-row-large">' . PHP_EOL
            . '                <span class="size">' . acorn_escape((string) $price['size']) . '</span>' . PHP_EOL
            . '                <span class="price">' . PHP_EOL
            . '                  <span class="eur">' . acorn_escape((string) $price['eur']) . '</span>' . PHP_EOL
            . '                  <span class="bgn">/ ' . acorn_escape((string) $price['bgn']) . '</span>' . PHP_EOL
            . '                </span>' . PHP_EOL
            . '              </div>';
    }
    return implode(PHP_EOL, $rows);
}

function acorn_apply_product_content(string $html, array $catalog, array $product, string $relativePrefix): string
{
    $category = acorn_category_name($catalog, (string) $product['category']);
    $image = $relativePrefix . $product['image'];
    $catalogPage = $relativePrefix . 'produkti.html';
    $html = (string) preg_replace_callback('#(<link rel="preload" as="image" href=")[^"]*(">[\r\n]+\s*<link rel="preconnect")#', function (array $match) use ($image): string {
        return $match[1] . acorn_escape($image) . $match[2];
    }, $html, 1);
    $html = (string) preg_replace_callback('#<li><a href="(?:\.\./\.\./)?produkti(?:\.html)?\#[^"]+">[^<]*</a></li>\s*<li class="separator">›</li>\s*<li class="current">[^<]*</li>#u', function () use ($product, $category, $catalogPage): string {
        return '<li><a href="' . acorn_escape($catalogPage) . '#' . acorn_escape((string) $product['category']) . '">' . acorn_escape($category) . '</a></li>' . PHP_EOL
            . '        <li class="separator">›</li>' . PHP_EOL
            . '        <li class="current">' . acorn_escape((string) $product['name']) . '</li>';
    }, $html, 1);
    $html = (string) preg_replace_callback('#(<div class="product-image-large">\s*)<img src="[^"]*" alt="[^"]*" loading="lazy">#', function (array $match) use ($product, $image): string {
        return $match[1] . '<img src="' . acorn_escape($image) . '" alt="' . acorn_escape((string) $product['name']) . ' на едро" loading="lazy">';
    }, $html, 1);
    $html = (string) preg_replace_callback('#(<div class="product-info">\s*<h1>)[\s\S]*?(</h1>)#', function (array $match) use ($product): string {
        return $match[1] . acorn_escape((string) $product['name']) . $match[2];
    }, $html, 1);
    $html = (string) preg_replace_callback('#(<div class="product-prices-large">\s*<h3>[\s\S]*?</h3>)[\s\S]*?(\s*</div>\s*<div class="product-cta">)#', function (array $match) use ($product): string {
        return $match[1] . PHP_EOL . acorn_render_product_price_rows($product) . $match[2];
    }, $html, 1);
    return $html;
}

function acorn_render_generated_product_page(array $catalog, array $product): string
{
    $template = file_get_contents(ACORN_PRODUCT_TEMPLATE_FILE);
    if (!is_string($template)) {
        throw new RuntimeException('Липсва шаблонът за нова продуктова страница.');
    }
    $html = str_replace('<head>', '<head>' . PHP_EOL . '  <base href="../../">', $template);
    $html = acorn_apply_product_seo($html, $catalog, $product);
    $html = acorn_apply_product_content($html, $catalog, $product, '');
    return ACORN_GENERATED_MARKER . PHP_EOL . $html;
}

function acorn_product_page_file(array $product): ?string
{
    $url = (string) ($product['url'] ?? '');
    if (!preg_match('#^produkti/[a-z0-9-]+/[a-z0-9-]+$#D', $url)) {
        return null;
    }
    return ACORN_ROOT . '/' . $url . '.html';
}

function acorn_is_generated_page(string $file): bool
{
    $prefix = is_file($file) ? file_get_contents($file, false, null, 0, strlen(ACORN_GENERATED_MARKER)) : false;
    return $prefix === ACORN_GENERATED_MARKER;
}

function acorn_write_public_file(string $file, string $content): void
{
    $directory = dirname($file);
    if (!is_dir($directory) && !mkdir($directory, 0755, true)) {
        throw new RuntimeException('Не може да бъде създадена папка за продуктовата страница.');
    }
    $temporary = $file . '.tmp-' . bin2hex(random_bytes(4));
    if (file_put_contents($temporary, $content, LOCK_EX) === false || !rename($temporary, $file)) {
        @unlink($temporary);
        throw new RuntimeException('Продуктовата страница не може да бъде публикувана. Проверете правата на папка produkti/.');
    }
}

function acorn_save_sitemap(array $catalog): void
{
    $date = substr((string) ($catalog['updatedAt'] ?? gmdate('c')), 0, 10);
    $pages = [
        ['https://acorn-bg.com/', 'monthly', '1.0'],
        ['https://acorn-bg.com/produkti.html', 'weekly', '0.9'],
        ['https://acorn-bg.com/za-nas', 'monthly', '0.7'],
        ['https://acorn-bg.com/kontakti', 'monthly', '0.7'],
        ['https://acorn-bg.com/obshti-usloviya', 'yearly', '0.3'],
    ];
    foreach ($catalog['products'] as $product) {
        if (($product['published'] ?? false) === true) {
            $pages[] = [acorn_product_canonical($product), 'weekly', '0.7'];
        }
    }
    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . PHP_EOL . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . PHP_EOL;
    foreach ($pages as $page) {
        $xml .= '  <url>' . PHP_EOL . '    <loc>' . acorn_escape($page[0]) . '</loc>' . PHP_EOL . '    <lastmod>' . $date . '</lastmod>' . PHP_EOL . '    <changefreq>' . $page[1] . '</changefreq>' . PHP_EOL . '    <priority>' . $page[2] . '</priority>' . PHP_EOL . '  </url>' . PHP_EOL;
    }
    $xml .= '</urlset>' . PHP_EOL;
    acorn_write_public_file(ACORN_SITEMAP_FILE, $xml);
}

function acorn_publish_catalog(array $catalog, array $previousCatalog): void
{
    $categoriesChanged = json_encode($catalog['categories']) !== json_encode($previousCatalog['categories'] ?? []);
    foreach ($catalog['products'] as $product) {
        $file = acorn_product_page_file($product);
        if ($file === null) {
            continue;
        }
        $previous = null;
        foreach (($previousCatalog['products'] ?? []) as $previousProduct) {
            if (($previousProduct['id'] ?? '') === ($product['id'] ?? '')) {
                $previous = $previousProduct;
                break;
            }
        }
        $productChanged = $previous === null || json_encode($product) !== json_encode($previous);
        if (($product['published'] ?? false) === true && (!is_file($file) || acorn_is_generated_page($file))) {
            acorn_write_public_file($file, acorn_render_generated_product_page($catalog, $product));
        } elseif (($product['published'] ?? false) === true && ($productChanged || $categoriesChanged)) {
            $html = file_get_contents($file);
            if (!is_string($html)) {
                throw new RuntimeException('Продуктовата страница не може да бъде прочетена.');
            }
            $html = acorn_apply_product_seo($html, $catalog, $product);
            $html = acorn_apply_product_content($html, $catalog, $product, '../../');
            acorn_write_public_file($file, $html);
        } elseif (($product['published'] ?? false) !== true && is_file($file)) {
            @unlink($file);
        }
    }
    foreach (($previousCatalog['products'] ?? []) as $product) {
        $file = acorn_product_page_file($product);
        $stillUsed = false;
        foreach ($catalog['products'] as $current) {
            if (($current['url'] ?? '') === ($product['url'] ?? '')) {
                $stillUsed = true;
                break;
            }
        }
        if (!$stillUsed && $file !== null && is_file($file)) {
            @unlink($file);
        }
    }
    acorn_save_sitemap($catalog);
}
