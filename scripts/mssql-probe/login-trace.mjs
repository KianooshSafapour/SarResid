// بازتولید منطق LoginDao با همان SQL — مستقیم روی Holoo2
import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo2', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
const name = 'آقاي صفا پور '
const rows = await pool.request().query(`select [Name], SuperVizor IsAdmin, UserCodeInc From Userdb U Where [Name] = N'${name}'`)
console.log('SQL match:', rows.recordset.length, '→', rows.recordset.map(r => ({ n: r.Name, admin: r.IsAdmin, code: r.UserCodeInc })))
await pool.close()
