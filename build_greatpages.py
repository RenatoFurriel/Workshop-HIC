# Gera lp-workshop-grc-ti-v2-greatpages.html a partir da lp-workshop-grc-ti-v2.html.
# Uso: python3 build_greatpages.py (na pasta do projeto). Requer Pillow.
import base64
import io
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "lp-workshop-grc-ti-v2.html")
OUT = os.path.join(HERE, "lp-workshop-grc-ti-v2-greatpages.html")
PHOTO = os.path.join(HERE, "roberto-circulo.png")
LOGO = os.path.join(HERE, "marca-itxpro-branco.png")

html = open(SRC).read()

from PIL import Image

# foto do mentor -> WEBP data URI
im = Image.open(PHOTO)
im.thumbnail((900, 900), Image.LANCZOS)
buf = io.BytesIO()
im.save(buf, "WEBP", quality=82, method=6)
data_uri = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()

# logo (PNG transparente, pequeno) -> PNG data URI, preservando o alpha
logo = Image.open(LOGO).convert("RGBA")
lbuf = io.BytesIO()
logo.save(lbuf, "PNG", optimize=True)
logo_uri = "data:image/png;base64," + base64.b64encode(lbuf.getvalue()).decode()

css = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
font_href = re.search(r'href="(https://fonts\.googleapis\.com/css2[^"]+)"', html).group(1)

ROOT = "#lpx-root"

def prefix_selector_list(sel_list):
    out = []
    for s in sel_list.split(","):
        s = s.strip()
        if not s:
            continue
        if s in (":root", "body"):
            out.append(ROOT)
        elif s == "html":
            out.append("html")
        elif s == "*":
            out.append(ROOT)
            out.append(ROOT + " *")
        else:
            out.append(ROOT + " " + s)
    return ",".join(out)

def transform(css_text):
    result = []
    i = 0
    n = len(css_text)
    while i < n:
        ch = css_text[i]
        if ch.isspace():
            i += 1
            continue
        brace = css_text.find("{", i)
        if brace == -1:
            break
        selector = css_text[i:brace].strip()
        # find matching close brace
        depth = 1
        j = brace + 1
        while j < n and depth:
            if css_text[j] == "{":
                depth += 1
            elif css_text[j] == "}":
                depth -= 1
            j += 1
        inner = css_text[brace + 1:j - 1]
        if selector.startswith("@keyframes"):
            result.append(selector + "{" + inner + "}")
        elif selector.startswith("@media"):
            result.append(selector + "{" + transform(inner) + "}")
        else:
            result.append(prefix_selector_list(selector) + "{" + inner + "}")
        i = j
    return "\n".join(result)

scoped = transform(css)

# wrapper must carry the old body styles; body selector already maps to #lpx-root.
body = body.replace('src="roberto-circulo.png"', 'src="' + data_uri + '"')
body = body.replace('src="marca-itxpro-branco.png"', 'src="' + logo_uri + '"')

# ASCII-safe escapes: the block must survive any host charset (GreatPages controls the page).
scoped = re.sub(r"[^\x00-\x7F]", lambda m: "\\%X " % ord(m.group()), scoped)

script_idx = body.find("<script>")
html_part, script_part = body[:script_idx], body[script_idx:]
html_part = html_part.encode("ascii", "xmlcharrefreplace").decode()
script_part = re.sub(r"[^\x00-\x7F]", lambda m: "\\u%04x" % ord(m.group()), script_part)
body = html_part + script_part

out = (
    "<!-- ===== INICIO DO BLOCO GREATPAGES - LP WORKSHOP GRC TI ===== -->\n"
    "<style>\n"
    '@import url("' + font_href + '");\n'
    + scoped +
    "\n</style>\n"
    '<div id="lpx-root">'
    + body +
    "</div>\n"
    "<!-- ===== FIM DO BLOCO GREATPAGES ===== -->\n"
)

open(OUT, "w").write(out)
print("written", OUT, len(out), "bytes")
