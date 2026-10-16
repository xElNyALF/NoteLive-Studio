# Activar las actualizaciones automáticas de NoteLive Studio

La aplicación integra `electron-updater`. Para que pueda encontrar releases necesita un canal de publicación real. La configuración no funcionará con el propietario de ejemplo.

## Configuración inicial

1. Crea un repositorio en GitHub llamado `NoteLive-Studio`. La forma más sencilla es que sea público: el código y las releases quedarán visibles. No incluyas `config.json`, `tokens.json`, claves de API, tokens de sesión ni datos personales. El `.gitignore` ya excluye los archivos sensibles de configuración local.
2. Ejecuta `SETUP-ACTUALIZACIONES.bat` y escribe tu usuario de GitHub y el nombre exacto del repositorio. El script actualiza tanto `package.json` como `update-config.json`.
3. Sube todo el código fuente y `.github/workflows/release-windows.yml` al repositorio.
4. La versión base para iniciar el canal de actualizaciones está en `0.3.0`. Publica el tag `v0.3.0`. GitHub Actions construirá el instalador NSIS para Windows y publicará el instalador junto con el manifiesto que necesita el actualizador.
5. Descarga e instala una vez el instalador desde esa Release. Ese será el primer build habilitado para actualizarse automáticamente.

## Para publicar futuras versiones

1. Cambia `version` en `package.json` (por ejemplo, `0.3.1`).
2. Sube el cambio de código al branch principal.
3. Crea y publica el tag correspondiente, por ejemplo `v0.3.1`.
4. La acción de GitHub construye y publica la nueva versión. Las apps instaladas comprueban actualizaciones al abrirse y cada seis horas, descargan el instalador y solicitan reiniciar para aplicarlo.

El flujo requiere conexión a Internet y GitHub Actions habilitado. Usa el instalador NSIS; la build portable no está configurada como canal de actualización. Para mantener el código privado, no uses el proveedor GitHub público sin valorar la exposición: conviene alojar el feed de actualizaciones en un servidor HTTPS/almacenamiento separado.


Nota de migración: la instalación previa de NoteLive Studio 0.3.0 no incluía electron-updater. Será necesario ejecutar una vez el instalador generado por esta build inicial 0.3.0 para incorporar el actualizador. A partir de esa instalación, futuras versiones 0.3.1, 0.3.2, etc., podrán recibirse mediante el actualizador.
