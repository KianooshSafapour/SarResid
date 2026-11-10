// ساخت کاربر TncCloud در Holoo4 + Holoo2 با رمزِ سریال (الگوریتم کرک‌شده) — همان کاری که خود سرویس می‌کند (UserCodeInc=-10)
import sql from 'mssql'
const enc = pw => {
  const L = 11
  const pair = { '>': 'E=', ';': '@S', 'A': 'E@', 'B': 'EE' }
  let t = ''
  for (const c of pw) {
    const shifted = String.fromCharCode(c.charCodeAt(0) + L)
    t += pair[shifted] ? '>>' + pair[shifted] : null
  }
  if (t.includes('null') || t.includes('NaN')) return null
  return t
}
const serial = '11069474'
const serialEnc = enc(serial)
console.log('serial encoded:', serialEnc)
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'master', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 20000 })
for (const db of ['Holoo4', 'Holoo2']) {
  try {
    await pool.request().query(`USE [${db}] IF NOT EXISTS (SELECT 1 FROM UserDb WHERE [Name]='TncCloud') INSERT INTO UserDb ([Name], PasWord, UserCodeInc, SuperVizor, DeActive, DBPnlOrderRight) VALUES (N'TncCloud', '${serialEnc ?? "''"}', -10, 1, 0, 1) ELSE UPDATE UserDb SET PasWord='${serialEnc ?? "''"}', SuperVizor=1, DeActive=0, DBPnlOrderRight=1 WHERE [Name]='TncCloud'`)
    const r = await pool.request().query(`USE [${db}] SELECT [Name], PasWord, UserCodeInc FROM UserDb WHERE [Name]='TncCloud'`)
    console.log(db, 'TncCloud:', JSON.stringify(r.recordset[0]))
  } catch (e) { console.log(db, 'err:', e.message.slice(0, 80)) }
}
await pool.close()
