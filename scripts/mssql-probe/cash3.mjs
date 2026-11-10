import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo4', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
try {
  const r = await pool.request().query("SELECT TOP 12 Sarfasl_Code, Sarfasl_Name, Type, Mahiat FROM Sarfasl WHERE Sarfasl_Name LIKE N'%صندوق%' OR Sarfasl_Name LIKE N'%بانک%'")
  for (const row of r.recordset) console.log(JSON.stringify(row))
} catch (e) { console.log('err:', e.message.slice(0, 100)) }
await pool.close()
