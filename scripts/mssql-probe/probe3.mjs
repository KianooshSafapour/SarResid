import sql from 'mssql'
for (const db of ['Holoo2', 'master']) {
  try {
    const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: db, options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 6000, requestTimeout: 10000 })
    const t = await pool.request().query("SELECT TOP 30 name FROM sys.databases ORDER BY name")
    console.log(`OK sa/Tnc@123@${db} → DBs:`, t.recordset.map(r => r.name).join(', '))
    await pool.close()
    process.exit(0)
  } catch (e) { console.log(`FAIL ${db}: ${e.message}`) }
}
