# -*- coding: utf-8 -*-
import io

PLACEHOLDER = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23f0efe6'/%3E%3Ccircle cx='40' cy='40' r='22' fill='none' stroke='%23c8a24a' stroke-width='3'/%3E%3C/svg%3E"

p = 'src/app/shop-ops/products/products-client.tsx'
s = io.open(p, encoding='utf-8').read()
s = s.replace("src={p.media[0]?.url || p.legacyImage || '/api/img/placeholder'}",
              "src={p.media[0]?.url || p.legacyImage || '" + PLACEHOLDER + "'}")
io.open(p, 'w', encoding='utf-8', newline='').write(s)

p = 'storefront/src/lib/api.ts'
s = io.open(p, encoding='utf-8').read()
s = s.replace("export interface GroupInfo { name: string; count: number }",
              "export interface GroupInfo { id?: string; name: string; emoji?: string; count: number }")
s = s.replace("  image: string | null\n  imported: boolean",
              "  image: string | null\n  gallery?: { url: string; caption: string }[]\n  imported: boolean")
io.open(p, 'w', encoding='utf-8', newline='').write(s)

p = 'storefront/src/app/page.tsx'
s = io.open(p, encoding='utf-8').read()
s = s.replace("{emojiFor(g.name)}\n                </span>", "{g.emoji || emojiFor(g.name)}\n                </span>")
io.open(p, 'w', encoding='utf-8', newline='').write(s)

p = 'storefront/src/app/categories/page.tsx'
s = io.open(p, encoding='utf-8').read()
s = s.replace("{emojiFor(g.name)}\n            </span>", "{g.emoji || emojiFor(g.name)}\n            </span>")
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('patched: placeholder + api types + category emoji')
