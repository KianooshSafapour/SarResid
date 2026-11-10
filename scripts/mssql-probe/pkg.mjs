// یافتن صندوق معتبر (cash sarfasl) در Holoo4
import sql from 'mssql'
if (!globalThis.fetch) process.exit(1)
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo4', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
try {
  const r = await pool.request().query("SELECT TOP 10 Code, Name, Mandeh FROM Sarfasl WHERE Kind = 1 OR [Name] LIKE N'%صندوق%' ORDER BY Code")
  for (const row of r.recordset) console.log(JSON.stringify(row))
} catch (e) {
  // ساختار sarfasl معلوم نیست — جست‌وجوی ستونی
  const t = await pool.request().query("SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME LIKE '%sarfasl%' OR TABLE_NAME LIKE '%Sarfasl%'")
  for (const row of t.recordset.slice(0, 20)) console.log(row.TABLE_NAME, '.', row.COLUMN_NAME)
}
await pool.close()
