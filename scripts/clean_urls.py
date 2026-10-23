#!/usr/bin/env python3
import glob
import os
import re

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

def clean_html_file(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    original = content
    filename = os.path.basename(file_path)

    # 1. Ensure head script is present
    target_script = HEAD_SCRIPT_404 if filename == "404.html" else HEAD_SCRIPT_REGULAR
    if "location.pathname.endsWith('.html')" not in content:
        if '<meta charset="utf-8">' in content:
            content = content.replace(
                '<meta charset="utf-8">',
                '<meta charset="utf-8">\n' + target_script,
                1
            )
        elif '<head>' in content:
            content = content.replace(
                '<head>',
                '<head>\n' + target_script,
                1
            )

    # 2. Clean internal href links
    def replace_href(m):
        quote = m.group(1)
        target = m.group(2)
        tail = m.group(3) or ""  # query params or hash

        clean_target = target.lstrip("./")

        if clean_target == "index.html":
            return f'href={quote}/{tail}{quote}'
        elif clean_target.endswith(".html"):
            slug = clean_target[:-5]
            return f'href={quote}/{slug}{tail}{quote}'
        return m.group(0)

    pattern = re.compile(r'href=(["\'])(?:\./)?([a-zA-Z0-9_\-]+\.html)([#?][^"\']*)?\1')
    content = pattern.sub(replace_href, content)

    # 3. Clean canonical URLs if they contain .html
    def replace_canonical(m):
        url = m.group(1)
        cleaned_url = re.sub(r'/index\.html$', '/', url)
        cleaned_url = re.sub(r'\.html$', '', cleaned_url)
        return f'<link href="{cleaned_url}" rel="canonical">'

    content = re.sub(r'<link href="([^"]+)" rel="canonical">', replace_canonical, content)

    if content != original:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Cleaned {file_path}")
        return True
    return False

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    html_files = glob.glob(os.path.join(root, "*.html"))
    changed = 0
    for file_path in sorted(html_files):
        if clean_html_file(file_path):
            changed += 1
    print(f"Finished. {changed} files updated.")

if __name__ == "__main__":
    main()
