import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'master', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
try {
  const a = await pool.request().query("SELECT AliasId, SortId, DatabaseDesc, DatabaseNames, DBPnlOrderRight FROM Alias_Holoo")
  for (const r of a.recordset) console.log('alias:', JSON.stringify(r))
} catch (e) { console.log('alias err:', e.message.slice(0, 80)) }
try {
  const s = await pool.request().query("USE Holoo2 SELECT [Name], [Boolean] FROM MSetup2 WHERE [Name] = 'SWSocket'")
  console.log('SWSocket:', JSON.stringify(s.recordset))
} catch (e) { console.log('SWSocket err:', e.message.slice(0, 80)) }
try {
  const u = await pool.request().query("USE Holoo2 SELECT [Name], UserCodeInc, DBPnlOrderRight FROM UserDb WHERE UserCodeInc = -10 OR UserCodeInc = 11")
  for (const r of u.recordset) console.log('user:', JSON.stringify(r))
} catch (e) { console.log('user err:', e.message.slice(0, 80)) }
await pool.close()
