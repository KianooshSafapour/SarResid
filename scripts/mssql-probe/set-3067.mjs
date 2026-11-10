import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo4', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 20000 })
// رمز «3067» با شیفت ۱۱: > ; A B → بدون تکرار متوالی
const enc = '>>E=>>@S>>E@>>EE'
await pool.request().query(`UPDATE UserDb SET PasWord='${enc}' WHERE [Name]='HzWebservice'`)
console.log('set HzWebservice(Holoo4) hash = encrypt(3067,+11)')
await pool.close()
