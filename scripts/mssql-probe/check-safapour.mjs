import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo4', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
try {
  const r = await pool.request().query("SELECT [Name], PasWord, UserCodeInc, SuperVizor, DeActive, DBPnlOrderRight FROM UserDb WHERE [Name] = 'safapour'")
  for (const row of r.recordset) console.log('Holoo4 user:', JSON.stringify(row).slice(0, 220))
  if (!r.recordset.length) console.log('NO safapour row in Holoo4.UserDb!')
} catch (e) { console.log('Holoo4 err:', e.message.slice(0, 80)) }
// SWSocket و alias برای Holoo4
try {
  const s = await pool.request().query("SELECT [Name], [Boolean] FROM MSetup2 WHERE [Name]='SWSocket'")
  console.log('Holoo4 SWSocket:', JSON.stringify(s.recordset))
} catch (e) { console.log('SWSocket err:', e.message.slice(0, 60)) }
try {
  const a = await pool.request().query("USE master SELECT DatabaseNames, DBPnlOrderRight FROM Alias_Holoo WHERE DatabaseNames='Holoo4'")
  console.log('alias Holoo4:', JSON.stringify(a.recordset))
} catch (e) { console.log('alias err:', e.message.slice(0, 60)) }
await pool.close()
