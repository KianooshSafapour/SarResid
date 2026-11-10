import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo2', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
// USERDB ساختار + چند ردیف (کاربران هلو)
try {
  const cols = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='USERDB'")
  console.log('USERDB cols:', cols.recordset.map(c => c.COLUMN_NAME).join(', '))
  const rows = await pool.request().query('SELECT TOP 8 * FROM USERDB')
  for (const r of rows.recordset) console.log(JSON.stringify(r).slice(0, 260))
} catch (e) { console.log('USERDB err:', e.message) }
await pool.close()
