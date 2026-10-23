#!/usr/bin/env python3
import urllib.request
import re
import os

PAGES = [
    ("https://sema-freigeist.webflow.io/de", "de/index.html", "/", "/de"),
    ("https://sema-freigeist.webflow.io/de/impressum", "de/impressum.html", "/impressum", "/de/impressum"),
    ("https://sema-freigeist.webflow.io/de/privacy-policy", "de/privacy-policy.html", "/privacy-policy", "/de/privacy-policy"),
    ("https://sema-freigeist.webflow.io/de/terms-conditions", "de/terms-conditions.html", "/terms-conditions", "/de/terms-conditions"),
    ("https://sema-freigeist.webflow.io/de/401", "de/401.html", "/401", "/de/401"),
    ("https://sema-freigeist.webflow.io/de/404", "de/404.html", "/404", "/de/404")
]

HEAD_SCRIPT_REGULAR = """  <script>
    if (location.pathname.endsWith('.html')) {
      var clean = location.pathname.replace(/\\/index\\.html$/, '/').replace(/\\.html$/, '');
      location.replace(clean + location.search + location.hash);
    }
  </script>"""

HEAD_SCRIPT_404 = """  <script>
    if (location.pathname.endsWith('.html')) {
      var clean = location.pathname.replace(/\\/index\\.html$/, '/').replace(/\\.html$/, '');
      location.replace(clean + location.search + location.hash);
    } else if (location.pathname.length > 1 && location.pathname.endsWith('/')) {
      location.replace(location.pathname.replace(/\\/+$/, '') + location.search + location.hash);
    }
  </script>"""

FAVICONS = """  <link href="/images/favicon.png" rel="icon" type="image/png" sizes="32x32" media="(prefers-color-scheme: light)">
  <link href="/images/favicon-dark.png" rel="icon" type="image/png" sizes="32x32" media="(prefers-color-scheme: dark)">
  <link href="/images/favicon-48.png" rel="icon" type="image/png" sizes="48x48">
  <link href="/images/webclip-180.png" rel="apple-touch-icon" sizes="180x180">
  <link href="/images/webclip-192.png" rel="icon" type="image/png" sizes="192x192">
  <link href="/images/webclip.png" rel="icon" type="image/png" sizes="512x512">"""

def sync_de():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    de_dir = os.path.join(root, "de")
    os.makedirs(de_dir, exist_ok=True)

    print("Syncing German pages from sema-freigeist.webflow.io...")
    for remote_url, local_rel_path, en_path, de_path in PAGES:
        local_path = os.path.join(root, local_rel_path)
        req = urllib.request.Request(remote_url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            content = urllib.request.urlopen(req).read().decode("utf-8")
        except Exception as e:
            print(f"Failed to fetch {remote_url}: {e}")
            continue

        # 0. Remove data-wf-domain (which triggers Webflow.js to inject "Made in Webflow" badge)
        content = re.sub(r'\s*data-wf-domain="[^"]*"', '', content)

        # 1. Use local stylesheets
        content = re.sub(
            r'<link href="https://cdn\.prod\.website-files\.com/[^"]+/css/sema-freigeist\.webflow\.shared\.[^"]+\.css"[^>]*>',
            '<link href="/css/normalize.css" rel="stylesheet" type="text/css">\n  <link href="/css/webflow.css" rel="stylesheet" type="text/css">\n  <link href="/css/sema-freigeist.webflow.css" rel="stylesheet" type="text/css">',
            content
        )

        # 2. Use local webflow.js
        content = re.sub(
            r'<script src="https://cdn\.prod\.website-files\.com/[^"]+/js/webflow\.schunk\.[^"]+\.js"[^>]*></script>\s*<script src="https://cdn\.prod\.website-files\.com/[^"]+/js/webflow\.schunk\.[^"]+\.js"[^>]*></script>\s*<script src="https://cdn\.prod\.website-files\.com/[^"]+/js/webflow\.[^"]+\.js"[^>]*></script>',
            '<script src="/js/webflow.js" type="text/javascript"></script>',
            content
        )

        # 3. Clean and normalize favicons
        content = re.sub(
            r'<link href="https://cdn\.prod\.website-files\.com/[^"]+_FREIGEIST%20ICON[^"]+"[^>]*>',
            '',
            content
        )
        content = content.replace("</head>", f"{FAVICONS}\n  <style>.w-webflow-badge {{ display: none !important; }}</style>\n</head>", 1)

        # 4. Inject head clean URL redirect
        target_script = HEAD_SCRIPT_404 if "404" in local_rel_path else HEAD_SCRIPT_REGULAR
        if "location.pathname.endsWith" not in content:
            if '<meta charset="utf-8"/>' in content:
                content = content.replace('<meta charset="utf-8"/>', f'<meta charset="utf-8"/>\n{target_script}', 1)
            elif '<meta charset="utf-8">' in content:
                content = content.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n{target_script}', 1)

        # 5. Internal footer / navigation links to German subpages
        content = content.replace('href="/de/terms-conditions.html"', 'href="/de/terms-conditions"')
        content = content.replace('href="terms-conditions.html"', 'href="/de/terms-conditions"')
        content = content.replace('href="/terms-conditions"', 'href="/de/terms-conditions"')
        content = content.replace('href="impressum.html"', 'href="/de/impressum"')
        content = content.replace('href="/impressum"', 'href="/de/impressum"')
        content = content.replace('href="privacy-policy.html"', 'href="/de/privacy-policy"')
        content = content.replace('href="/privacy-policy"', 'href="/de/privacy-policy"')
        content = content.replace('href="index.html"', 'href="/de"')

        # 6. Language switcher links:
        # On DE pages, DE is current and hidden, EN is visible pointing to the English equivalent
        switcher_html = f'<div class="locales-wrapper w-locales-list"><div role="list" class="locales-list w-locales-items"><div role="listitem" class="locale w-locales-item"><a hreflang="en" href="{en_path}" class="link locale">EN</a></div><div role="listitem" class="locale w-locales-item"><a hreflang="de-DE" href="{de_path}" aria-current="page" class="link locale w--current">DE</a></div></div></div>'
        content = re.sub(
            r'<div class="locales-wrapper w-locales-list">.*?</div></div></div>',
            switcher_html,
            content,
            flags=re.DOTALL
        )

        with open(local_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Synced {local_rel_path}")

    print("German pages sync complete.")

if __name__ == "__main__":
    sync_de()
