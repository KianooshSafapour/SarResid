import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'master', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 60000 })
// SQL Agent روشن است؟
try {
  const ag = await pool.request().query("SELECT COUNT(1) n FROM sys.dm_server_services WHERE servicename LIKE 'SQL Server Agent%' AND status_desc = 'Running'")
  console.log('SQLAgent running:', ag.recordset[0].n > 0)
} catch (e) { console.log('agent check err:', e.message.slice(0, 60)) }
// CDC روی Holoo4 (تست)
try {
  await pool.request().query('USE Holoo4 EXEC sys.sp_cdc_enable_db')
  console.log('CDC enabled on Holoo4 ✓')
} catch (e) { console.log('cdc err:', e.message.slice(0, 120)) }
const r = await pool.request().query("SELECT name, is_cdc_enabled FROM sys.databases WHERE name = 'Holoo4'")
console.log(JSON.stringify(r.recordset[0]))
await pool.close()
