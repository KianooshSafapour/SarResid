import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo4', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
// گزارش GetCash خود سرویس — ببینیم چه صندوق‌هایی را معتبر می‌داند
const r = await pool.request().query("SELECT TOP 15 Sar_Code, Sar_Name FROM Sarfasl WHERE Sar_Name LIKE N'%صندوق%'")
for (const row of r.recordset) console.log(JSON.stringify(row))
catch (e) { console.log("err:", e.message.slice(0, 80)) }
await pool.close()
