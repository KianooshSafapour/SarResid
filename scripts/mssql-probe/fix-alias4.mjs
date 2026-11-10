import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'master', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
const r = await pool.request().query("UPDATE Alias_Holoo SET DBPnlOrderRight = 1 WHERE DatabaseNames = 'Holoo4'; SELECT @@ROWCOUNT n")
console.log('alias4 flag:', r.recordset[0]?.n)
await pool.close()
