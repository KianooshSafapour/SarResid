import { execSync } from 'child_process'
import fs from 'fs'

// ۱۲ تصویر دسته‌بندی حرفه‌ای برای سندباکس دمو — «هایپر نمونه»
const OUT = 'public/demo-img'
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const items = [
  ['dairy', 'Professional supermarket product photography of fresh dairy milk bottles and yogurt cups on clean white background, soft studio lighting, high quality, appetizing'],
  ['bakery', 'Professional bakery photography of fresh Persian sangak bread and golden pastries on wooden shelf, warm studio lighting, appetizing, high quality'],
  ['produce', 'Fresh colorful fruits and vegetables arrangement in modern supermarket produce section, professional photography, vibrant, high quality'],
  ['meat', 'Professional deli counter photography of fresh packaged chicken and red meat cuts on display, clean white background, studio lighting, high quality'],
  ['beverages', 'Professional product photography of colorful juice bottles and soda cans arrangement, white background, studio lighting, vibrant, high quality'],
  ['snacks', 'Professional product photography of snack chips bags and cookies on white background, colorful packaging, studio lighting, high quality'],
  ['cleaning', 'Professional product photography of household cleaning supplies bottles and detergent, white background, bright studio lighting, high quality'],
  ['frozen', 'Professional photography of frozen food packages and ice cream boxes with frost effect, cool tone lighting, white background, high quality'],
  ['personalcare', 'Professional product photography of shampoo bottles and personal care products, elegant white background, soft studio lighting, high quality'],
  ['grocery', 'Professional product photography of rice bags pasta and cooking oil bottles, pantry staples, white background, studio lighting, high quality'],
  ['storefront', 'Wide angle photography of a modern bright supermarket interior with organized aisles and green branding accents, professional architectural photography, high quality'],
  ['team', 'Professional corporate photo style illustration of friendly supermarket staff team wearing green aprons standing together, warm lighting, high quality'],
]

const results: Array<[string, string]> = []
for (const [name, prompt] of items) {
  const out = `${OUT}/${name}.png`
  if (fs.existsSync(out)) { results.push([name, 'skip']); continue }
  try {
    execSync(`z-ai image -p ${JSON.stringify(prompt)} -o ${out} -s 1024x1024`, { stdio: 'pipe', timeout: 180000 })
    results.push([name, 'ok'])
    console.log('OK', name)
  } catch (e) {
    results.push([name, 'fail'])
    console.error('FAIL', name, String(e).slice(0, 200))
  }
}
console.log(JSON.stringify(results))
