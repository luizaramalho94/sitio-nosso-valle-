#!/usr/bin/env python3
"""Atualiza a lista de arquivos guardados offline em docs/sw.js.

A versão do cache é um resumo (hash) de todos os arquivos: qualquer mudança
no app faz o iPhone baixar a versão nova na próxima abertura.
Uso: python3 tools/gerar-sw.py
"""
import hashlib, json, os, re

DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs')
SKIP = {'sw.js', '.nojekyll'}

files = []
for root, _, names in os.walk(DOCS):
    for n in names:
        rel = os.path.relpath(os.path.join(root, n), DOCS).replace(os.sep, '/')
        if rel in SKIP or rel.endswith('.LICENSE') or rel.endswith('maskable.svg'):
            continue
        files.append(rel)
files.sort()

h = hashlib.sha1()
for f in files:
    h.update(f.encode())
    with open(os.path.join(DOCS, f), 'rb') as fp:
        h.update(fp.read())
version = 'valle-' + h.hexdigest()[:10]

path = os.path.join(DOCS, 'sw.js')
src = open(path, encoding='utf-8').read()
src = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{version}';", src)
src = re.sub(r"const ASSETS = \[.*?\];", 'const ASSETS = ' + json.dumps(['./'] + files, indent=2) + ';', src, flags=re.S)
open(path, 'w', encoding='utf-8').write(src)
print(version, len(files), 'arquivos')
