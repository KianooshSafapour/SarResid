// ساخت کاربر وب‌سرویس با رمز معلوم‌الگوریتم — کپی کامل ردیف آقای صفا پور با نام و رمز جدید
import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo2', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 20000 })
// ۱) رمز «730600» از نگاشت معلوم (۳۰۶۷)
const map = { '3': '>>E=', '0': '>>@S', '7': '>>EE', '6': '>>E@' }
const plain = '736007'
const enc = [...plain].map(c => map[c]).join('')
console.log('plain:', plain, '→ encoded:', enc)
// ۲) کپی ردیف نمونه
const src = await pool.request().query("SELECT TOP 1 * FROM UserDb WHERE UserCodeInc = 11")
const row = src.recordset[0]
const cols = Object.keys(row).filter(c => c !== 'UserCodeInc')
const newName = 'HzWebservice'
const newCode = -10
const insertCols = ['Name', 'PasWord', 'UserCodeInc', 'SuperVizor', 'DeActive']
const r2 = await pool.request().query(`INSERT INTO UserDb (Name, PasWord, UserCodeInc, SuperVizor, DeActive) VALUES (N'${newName}', '${enc}', ${newCode}, 1, 0)`)
console.log('insert result:', JSON.stringify(r2.rowsAffected))
const chk = await pool.request().query("SELECT [Name], PasWord, UserCodeInc FROM UserDb WHERE UserCodeInc = -10")
console.log('row:', JSON.stringify(chk.recordset[0]))
await pool.close()
