import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo2', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
const tables = await pool.request().query("SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%ser%' OR TABLE_NAME LIKE '%User%' OR TABLE_NAME LIKE '%login%' OR TABLE_NAME LIKE '%Login%'")
console.log('user-ish tables:')
for (const t of tables.recordset) console.log(` ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`)
// ساختارهای احتمالی
for (const t of ['dbo.Users', 'dbo.UserInfo', 'dbo.TUsers', 'dbo.WebUsers']) {
  try {
    const cols = await pool.request().query(`SELECT TOP 20 COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t.split('.')[1]}'`)
    if (cols.recordset.length) console.log(`\n${t} cols:`, cols.recordset.map(c => c.COLUMN_NAME).join(', '))
    const rows = await pool.request().query(`SELECT TOP 5 * FROM ${t}`)
    console.log(JSON.stringify(rows.recordset).slice(0, 500))
  } catch (e) { /* نه */ }
}
await pool.close()
