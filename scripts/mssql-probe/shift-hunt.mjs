import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo4', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 20000 })
const r = await pool.request().query("UPDATE UserDb SET PasWord = (SELECT PasWord FROM UserDb WHERE [Name]='safapour') WHERE [Name]='HzWebservice'; SELECT @@ROWCOUNT n")
console.log('HzWebservice(Holoo4) password synced to safapour:', r.recordset[0]?.n)
await pool.close()
