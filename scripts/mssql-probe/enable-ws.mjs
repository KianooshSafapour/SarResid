import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'master', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 20000 })
// ۱) android flag روی alias
let r1 = await pool.request().query("UPDATE Alias_Holoo SET DBPnlOrderRight = 1 WHERE DatabaseNames = 'Holoo2'; SELECT @@ROWCOUNT AS n")
console.log('alias flag:', r1.recordset[0]?.n)
// ۲) SWSocket در MSetup2 — ساختار ستون‌ها را اول ببینیم
const cols = await pool.request().query("USE Holoo2 SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='MSetup2'")
console.log('MSetup2 cols:', cols.recordset.map(c => c.COLUMN_NAME).join(','))
// ۳) flag کاربر
let r3 = await pool.request().query("USE Holoo2 UPDATE UserDb SET DBPnlOrderRight = 1 WHERE UserCodeInc IN (11, -10); SELECT @@ROWCOUNT AS n")
console.log('user flag:', r3.recordset[0]?.n)
await pool.close()
