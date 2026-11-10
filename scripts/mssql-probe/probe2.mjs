// Try Windows-style / other common SQL users on TncHoloo instance
import sql from 'mssql'
const tries = [
  { user: 'sa', password: 'Tnc@123' },
  { user: 'TncHoloo', password: 'Tnc@123' },
  { user: 'holoo', password: 'holoo' },
]
for (const t of tries) {
  try {
    const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: t.user, password: t.password, database: 'master', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 6000, requestTimeout: 10000 })
    const dbs = await pool.request().query("SELECT name FROM sys.databases")
    console.log(`OK ${t.user}:`, dbs.recordset.map(r => r.name).join(', '))
    await pool.close()
    process.exit(0)
  } catch (e) { console.log(`FAIL ${t.user}: ${e.message}`) }
}
