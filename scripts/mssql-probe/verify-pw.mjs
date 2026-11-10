// تطبیق مستقیم رمز با ردیف آقای صفا پور — رمز ارسالی باید با همان الگوریتم تبذیل شود
import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo2', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
const rows = await pool.request().query("SELECT [Name], PasWord, UserCodeInc FROM UserDb WHERE [Name] LIKE N'%صفا%'")
for (const r of rows.recordset) {
  console.log('user:', JSON.stringify(r.Name), '| code:', r.UserCodeInc)
  console.log('stored PasWord:', JSON.stringify(r.PasWord), '| len:', r.PasWord?.length)
}
await pool.close()
