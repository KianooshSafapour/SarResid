import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo2', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
for (const db of ['Holoo2', 'Holoo1']) {
  try {
    const r = await pool.request().query(`USE [${db}] SELECT TOP 3 [Name], [Boolean] FROM MSetup2 WHERE [Name] IN ('SWSocket','Web Service','WebService','SWSrv') OR [Name] LIKE '%Socket%' OR [Name] LIKE '%Web%'`)
    for (const row of r.recordset) console.log(db, '→', JSON.stringify(row))
  } catch (e) { console.log(db, 'ERR:', e.message.slice(0, 60)) }
}
await pool.close()
