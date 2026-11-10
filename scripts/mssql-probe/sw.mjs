import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo2', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
try {
  const sw = await pool.request().query("SELECT [Name], [Boolean], [String] FROM MSetup2 WHERE [Name] IN ('SWSocket','1st_SerialNo')")
  for (const r of sw.recordset) console.log('MSetup2:', JSON.stringify(r))
} catch (e) { console.log('MSetup2 err:', e.message) }
try {
  const u = await pool.request().query("SELECT [Name], UserCodeInc, DBPnlOrderRight, DeActive, SuperVizor FROM UserDb WHERE [Name] LIKE N'%صفا%' OR [Name] LIKE N'%مدير%'")
  for (const r of u.recordset) console.log('User:', JSON.stringify(r))
} catch (e) { console.log('user err:', e.message) }
// کدام دیتابیس SWSocket فعال دارد؟
try {
  const dbs = await pool.request().query("SELECT name FROM sys.databases WHERE name LIKE 'Holoo%'")
  for (const d of dbs.recordset) {
    try {
      const r = await pool.request().query(`USE [${d.name}] SELECT isNull(MAX([Boolean]),0) b FROM MSetup2 WHERE [Name]='SWSocket'`)
      console.log(`SWSocket ${d.name}:`, r.recordset[0]?.b)
    } catch (e) { console.log(`SWSocket ${d.name}: ERR ${e.message.slice(0, 50)}`) }
  }
} catch (e) { console.log('dbs err:', e.message) }
await pool.close()
