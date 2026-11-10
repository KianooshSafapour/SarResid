import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'Holoo2', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 20000 })
await pool.request().query("IF NOT EXISTS (SELECT 1 FROM MSetup2 WHERE [Name]='SWSocket') INSERT INTO MSetup2 ([Name], [Boolean]) VALUES ('SWSocket', 1) ELSE UPDATE MSetup2 SET [Boolean]=1 WHERE [Name]='SWSocket'")
const chk = await pool.request().query("SELECT [Name], [Boolean] FROM MSetup2 WHERE [Name]='SWSocket'")
console.log('SWSocket now:', JSON.stringify(chk.recordset[0]))
await pool.close()
