#!/usr/bin/env python3
"""Dark -> light theme pass (reconstructed). See notes in the repo history:
rewrites the neutral palette to the light design, handling text-white by
context since it is correct on a coloured fill and wrong on a dark card."""
import re, pathlib

SURFACE = [
    (r'bg-\[#070F1E\]', 'bg-[#F5F7FA]'),
    (r'bg-\[#0A1628\]', 'bg-white'),
    (r'bg-\[#101C4A\]', 'bg-blue-50'),
    (r'bg-slate-950/(40|50|60)\b', 'bg-slate-100'),
    (r'bg-slate-950/(70|80|85|90|95|98)\b', 'bg-white'),
    (r'bg-slate-950\b', 'bg-white'),
    (r'bg-slate-900/(\d+)\b', 'bg-white'),
    (r'bg-slate-900\b', 'bg-white'),
    (r'bg-slate-800/(\d+)\b', 'bg-slate-100'),
    (r'bg-slate-800\b', 'bg-slate-100'),
    (r'bg-slate-700/(\d+)\b', 'bg-slate-200'),
    (r'bg-slate-700\b', 'bg-slate-200'),
    (r'border-slate-950\b', 'border-slate-200'),
    (r'border-slate-900/(\d+)\b', 'border-slate-200'),
    (r'border-slate-900\b', 'border-slate-200'),
    (r'border-slate-800/(\d+)\b', 'border-slate-200'),
    (r'border-slate-800\b', 'border-slate-200'),
    (r'border-slate-700/(\d+)\b', 'border-slate-300'),
    (r'border-slate-700\b', 'border-slate-300'),
    (r'divide-slate-800\b', 'divide-slate-200'),
    (r'border-white/(10|20)\b', 'border-black/5'),
    (r'ring-white/(10|20)\b', 'ring-black/5'),
    (r'text-slate-100\b', 'text-slate-800'),
    (r'text-slate-200\b', 'text-slate-700'),
    (r'text-slate-300\b', 'text-slate-600'),
    (r'text-slate-400\b', 'text-slate-500'),
    (r'placeholder:text-slate-600\b', 'placeholder:text-slate-400'),
]
HUES = 'blue|indigo|purple|violet|emerald|green|rose|red|amber|orange|sky|cyan|teal'
OWNS = re.compile(rf'(bg-gradient|from-({HUES})-|bg-({HUES})-|bg-black)')
LIT = re.compile(r"(['\"`])((?:[^'\"`\\]|\\.)*?)\1", re.S)

def process(text):
    def repl(m):
        q, body = m.group(1), m.group(2)
        if not re.search(r'\b(bg|text|border|from|via|to|ring|divide|placeholder)-', body):
            return m.group(0)
        for pat, rep in SURFACE:
            body = re.sub(pat, rep, body)
        if 'text-white' in body and not OWNS.search(body):
            body = re.sub(r'\btext-white\b', 'text-slate-900', body)
        return f'{q}{body}{q}'
    return LIT.sub(repl, text)

for p in sorted(list(pathlib.Path('src').rglob('*.tsx')) + list(pathlib.Path('src').rglob('*.ts'))):
    if p.name in ('ListingDetailModal.tsx', 'SellListingModal.tsx'):
        continue  # already final
    o = p.read_text(); n = process(o)
    if n != o:
        p.write_text(n); print(f'  {p.name}')
