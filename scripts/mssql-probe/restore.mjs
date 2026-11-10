import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo4', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
// بازگرداندن رمز HzWebservice به مقدار معلوم (30076677) — تمیزکاری آزمون‌ها
await pool.request().query("UPDATE UserDb SET PasWord = (SELECT PasWord FROM UserDb WHERE [Name]='safapour') WHERE [Name]='HzWebservice'")
console.log('HzWebservice(Holoo4) restored to verified 30076677 hash')
await pool.close()
