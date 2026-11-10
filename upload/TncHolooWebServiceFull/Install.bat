start java -jar "%~dp0JarFile\tzupdater.jar" -u
start "" "%~dp0JarFile\TNCHolooWebService.exe" Install 
timeout 5
net start TNCHolooWebService