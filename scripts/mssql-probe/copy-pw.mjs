import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo2', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
await pool.request().query("UPDATE UserDb SET PasWord = (SELECT PasWord FROM UserDb WHERE UserCodeInc = 11) WHERE UserCodeInc = -10")
const chk = await pool.request().query("SELECT [Name], PasWord, SuperVizor, DeActive, DBPnlOrderRight FROM UserDb WHERE UserCodeInc = -10")
console.log(JSON.stringify(chk.recordset[0]))
await pool.close()
