#!/usr/bin/env python3
"""Follow-up contrast passes (reconstructed):
 1. brand-tinted badges: 20%-fill + 300-weight text -> 50 fill + 700 text
 2. dark brand fills and dark gradient stops -> light equivalents
 3. 400-weight brand icons -> 600, unless on a coloured fill
"""
import re, pathlib
HUES = 'blue|indigo|purple|violet|emerald|green|rose|red|amber|orange|sky|cyan|teal'
pair = re.compile(rf'bg-({HUES})-(\d+)(/\d+)?(\s+)text-\1-(100|200|300)\b')
brd  = re.compile(rf'border-({HUES})-(\d+)/(\d+)\b')
pale = re.compile(rf'\btext-({HUES})-(200|300)\b')
fill = re.compile(rf'bg-({HUES})-(800|900|950)(/\d+)?')
grad_slate = re.compile(r'(from|via|to)-slate-(800|900|950)(/\d+)?')
grad_brand = re.compile(r'(from|via|to)-(blue|indigo)-(950)(/\d+)?')
COLOURED = re.compile(rf'(bg-gradient|bg-({HUES})-[5-9]\d\d|bg-black)')
icon400 = re.compile(rf'\btext-({HUES})-400\b')
KEEP_GRAD = {'App.tsx', 'OnboardingScreen.tsx'}

for p in sorted(pathlib.Path('src').rglob('*.tsx')):
    o = s = p.read_text()
    s = pair.sub(lambda m: f'bg-{m.group(1)}-50{m.group(4)}text-{m.group(1)}-700', s)
    s = brd.sub(lambda m: f'border-{m.group(1)}-200', s)
    s = pale.sub(lambda m: f'text-{m.group(1)}-700', s)
    s = fill.sub(lambda m: f'bg-{m.group(1)}-50', s)
    if p.name not in KEEP_GRAD:
        s = grad_slate.sub(lambda m: f'{m.group(1)}-white', s)
        s = grad_brand.sub(lambda m: f'{m.group(1)}-{m.group(2)}-600', s)
    # icons: only when the same className isn't painting its own colour
    out, prev, res = [], 0, []
    for m in icon400.finditer(s):
        st = s.rfind('className=', 0, m.start())
        attr = s[st:m.start()+200] if st != -1 else ''
        end = min([i for i in (attr.find('">',10), attr.find('`}',10), attr.find("'}",10)) if i > 0] or [200])
        if COLOURED.search(attr[:end]):
            continue
        out.append((m.start(), m.end(), f'text-{m.group(1)}-600'))
    for a, b, rep in out:
        res.append(s[prev:a]); res.append(rep); prev = b
    res.append(s[prev:]); s = ''.join(res)
    if s != o:
        p.write_text(s); print(f'  {p.name}')
