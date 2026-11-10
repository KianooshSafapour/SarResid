import sql from 'mssql'
const cfg = { server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'master', authentication: undefined, options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 }
try {
  const pool = await new sql.connect(cfg)
  const dbs = await pool.request().query("SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb')")
  console.log('DBs:', dbs.recordset.map(r => r.name).join(', '))
  await pool.close()
} catch (e) { console.log('ERR:', e.message) }
