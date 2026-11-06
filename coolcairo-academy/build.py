"""Stitch src/ into one self-contained page.

academy.html: page content for the Claude artifact viewer (no doctype/html/head/body; the viewer adds them).
index.html:   the same page wrapped as a normal HTML document, to open from disk or host anywhere.
"""
from pathlib import Path

src = Path(__file__).parent / "src"
head = """<title>CoolCairo Academy</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="A mission-based game that teaches urban heat, satellite remote sensing and every part of the CoolCairo method.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,500..800&family=IBM+Plex+Mono:wght@400;500;600&family=Public+Sans:wght@400;500;600;700&display=swap">
"""
style = "<style>\n" + (src / "style.css").read_text() + "\n</style>\n"
shell = (src / "shell.html").read_text()
js = "\n".join((src / f).read_text() for f in ["core.js", "content.js", "labs1.js", "labs2.js"]) + "\nroute();\n"
page = head + style + shell + "\n<script>\n" + js + "</script>\n"
(Path(__file__).parent / "academy.html").write_text(page)
doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}[hidden]{display:none!important}</style>\n'
       + head + style + "</head>\n<body>\n" + shell + "\n<script>\n" + js + "</script>\n</body>\n</html>\n")
(Path(__file__).parent / "index.html").write_text(doc)
print(f"academy.html {len(page)//1024} KB, index.html {len(doc)//1024} KB")
