import sql from 'mssql'
const pool = await new sql.connect({ server: '192.168.1.121', port: 1433, user: 'sa', password: 'Tnc@123', database: 'master', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 8000, requestTimeout: 15000 })
const r = await pool.request().query("SELECT name, is_cdc_enabled, is_broker_enabled FROM sys.databases WHERE name LIKE 'Holoo%'")
for (const row of r.recordset) console.log(JSON.stringify(row))
const agent = await pool.request().query("EXEC xp_servicecontrol N'STATUS', N'SQLServerAgent'")
console.log('SQLAgent:', JSON.stringify(agent.recordset))
await pool.close()
