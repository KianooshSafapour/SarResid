/** اسکن سریع LAN فروشگاه برای یافتن وب‌سرویس هلو (8080/5000) و SQL Server (1433) */
const http = require('http')
const net = require('net')

const PORTS = [8080, 5000, 1433]
const ips = []
for (let i = 2; i <= 254; i++) ips.push(`192.168.1.${i}`)

function probe(ip, port) {
  return new Promise((resolve) => {
    const s = new net.Socket()
    s.setTimeout(700)
    s.once('connect', () => { s.destroy(); resolve({ ip, port }) })
    s.once('timeout', () => { s.destroy(); resolve(null) })
    s.once('error', () => { s.destroy(); resolve(null) })
    s.connect(port, ip)
  })
}

async function main() {
  const jobs = []
  for (const ip of ips) for (const p of PORTS) jobs.push(probe(ip, p))
  const hits = (await Promise.all(jobs)).filter(Boolean)
  console.log('open ports:', JSON.stringify(hits))
  for (const h of hits.filter((x) => x.port !== 1433)) {
    await new Promise((resolve) => {
      const req = http.get({ host: h.ip, port: h.port, path: '/TncHoloo/api/', timeout: 2500 }, (res) => {
        let b = ''
        res.on('data', (c) => (b += c))
        res.on('end', () => { console.log(`http://${h.ip}:${h.port}/TncHoloo/api/ → ${res.statusCode} ${b.slice(0, 120)}`); resolve() })
      })
      req.on('timeout', () => { req.destroy(); resolve() })
      req.on('error', () => resolve())
    })
  }
}
main()
