import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'master', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
for (const db of ['Holoo1', 'Holoo4']) {
  const r = await pool.request().query(`USE [${db}] SELECT [Name], PasWord FROM UserDb WHERE UserCodeInc = 1`)
  console.log(db, 'admin:', JSON.stringify(r.recordset[0]))
}
await pool.close()
