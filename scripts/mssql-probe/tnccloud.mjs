import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo2', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
const r = await pool.request().query("SELECT [Name], PasWord, UserCodeInc, DeActive FROM UserDb WHERE [Name] LIKE N'%Tnc%' OR [Name] LIKE N'%Cloud%' OR UserCodeInc = -10")
console.log('TncCloud-ish rows:', r.recordset.length)
for (const row of r.recordset) console.log(JSON.stringify(row).slice(0, 200))
// رمز مدیر (نمونهٔ رمزگذاری برای مقایسهٔ الگو)
const m = await pool.request().query("SELECT PasWord FROM UserDb WHERE UserCodeInc = 1")
console.log('admin PasWord:', JSON.stringify(m.recordset[0]?.PasWord))
await pool.close()
