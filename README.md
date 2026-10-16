# NoteLive Studio — aplicación de escritorio para Windows

NoteLive Studio reúne Spotify, Twitch, TikTok LIVE, el chat general multicanal, la voz de ElevenLabs y los overlays de OBS en una sola aplicación de Windows. La aplicación se abre como una ventana normal; el servidor local funciona internamente y se detiene al cerrar el programa.

## Para el usuario: generar el instalador de Windows

El ZIP contiene el código fuente y los scripts de compilación, no un instalador firmado ya generado. Para crear el `.exe` de instalación en Windows:

1. Instala Node.js 22.12 o posterior desde https://nodejs.org/ si no lo tienes.
2. Descomprime la carpeta `notelive-studio` en una ubicación local, no dentro de una carpeta temporal.
3. Ejecuta `BUILD-WINDOWS.bat` y espera a que termine la instalación de dependencias y la compilación. Requiere conexión a Internet la primera vez.
4. El instalador aparecerá en `dist\NoteLive-Studio-Setup-0.3.9.exe`.
5. Ejecuta el instalador y abre NoteLive Studio desde el acceso directo del escritorio o el menú Inicio. El programa instalado no necesita que abras la terminal ni que ejecutes `start.bat`.

`start.bat` es para ejecutar el código fuente en modo desarrollo; no es el modo recomendado una vez instalado el programa.

## Migrar el proyecto web que ya utilizabas

En el primer inicio, NoteLive Studio pregunta si deseas importar la configuración de la versión anterior. Selecciona la carpeta raíz del antiguo `spotify-live-overlay`, donde estaban `config.json` y `tokens.json`. La aplicación copia esos archivos a la carpeta privada de datos del usuario y no borra el proyecto antiguo. Si eliges empezar desde cero o no se encuentran los archivos, podrás configurar todo desde el panel.

La configuración y las credenciales se guardan en la carpeta de datos de NoteLive Studio de Windows (`%APPDATA%\notelive-studio`). No compartas `config.json` ni `tokens.json`.

## Funciones

- **v0.4.0:** Twitch se conecta desde la app con un código de autorización. La versión de escritorio usa un Client ID público incluido en el programa y no pide al usuario pegar un Client Secret; cada streamer autoriza su propia cuenta y los tokens se guardan localmente. En modo web/desarrollo permanece disponible el flujo avanzado anterior.
- **v0.3.9:** la alerta de nuevo seguidor tiene diez estilos, admite imagen/GIF de hasta 10 MB, permite ajustar la imagen para que quepa o recortarla visualmente, y admite sonido personalizado de hasta 5 MB y 10 segundos. Los archivos se guardan en el perfil local de la aplicación y se sirven desde el overlay local de OBS.
- **v0.3.8:** el chat general y el overlay de OBS muestran un icono junto a la etiqueta TWITCH/TIKTOK LIVE para identificar el origen de cada mensaje. El actualizador tiene una barra de progreso integrada y muestra “Listo, reinicia para instalar” con un botón de reinicio. Se añade una sección informativa de Kick marcada como “Próximamente”; no implica que Kick ya esté conectado.
- **v0.3.7:** personalización del chat general con ocho tipografías, tamaño y colores de texto, opacidad, número de mensajes y controles para ocultar avatares, insignias, etiquetas y hora. Muestra avatares circulares de Twitch/TikTok, iconos de streamer, moderador, VIP, suscriptor y etiqueta `TÚ`. Añade el comando de voz `!voice` para leer una frase elegida con ElevenLabs y una opción para permitir moderadores.
- **v0.3.6:** chat general que reúne Twitch y TikTok LIVE, etiqueta cada mensaje con su plataforma, muestra los emotes de Twitch como imágenes y admite stickers de TikTok cuando el conector los entrega. Incluye una fuente de Navegador combinada para OBS en `http://127.0.0.1:8787/unified-chat-overlay` y filtros para ver todas las plataformas o solo una.
- **v0.3.5:** integración de Twitch con OAuth, EventSub WebSocket para `channel.follow` y `channel.chat.message`, alerta de follow personalizable, overlay de chat separado para OBS y lectura opcional del chat mediante la fuente de ElevenLabs `/tts`. Requiere registrar una app de Twitch y añadir la URL de redirección `http://localhost:8787/twitch/callback`.


- **v0.3.1:** editor de notificación musical (estilo, posición, duración, colores, opacidad y elementos visibles), visualizador FFT real del audio de Windows para OBS (barras, onda, espejo o círculo) y mini overlay de escritorio opcional. La captura se inicia manualmente; el audio no se graba y solo se envían niveles al servidor local.
- **v0.3.4:** diez estilos seleccionables para la notificación musical (Original, Aesthetic, Rhythm Inside, Mini Capsule, Neon Pulse, Retro EQ, Orbit, Cyberpunk, Mono Clean y Always On). Puedes colocar el visualizador dentro de la tarjeta o debajo y elegir entre notificación temporal o reproductor permanente. En el modo permanente solo se anima el contenido al cambiar de canción; el panel no se oculta.

- Interfaz reorganizada en navegación lateral: Inicio, Chat general, Twitch (chat, follows y overlays), Spotify, TikTok LIVE, Voz IA, OBS y Personalizar.
- Fondo personalizable de la interfaz: importa una imagen local, la aplicación optimiza su tamaño, y permite ajustar el desenfoque, oscurecimiento, opacidad de los paneles, posición del wallpaper y color de acento. Los ajustes se guardan en el almacenamiento local de la instalación.

- Spotify Web API mediante OAuth Authorization Code + PKCE.
- Overlay musical con portada, artista, título, progreso y animaciones, transparente para OBS.
- Chat de TikTok LIVE con historial de comentarios y chat general multicanal que reúne Twitch y TikTok en NoteLive Studio y OBS.
- Lector de comentarios mediante ElevenLabs, plantilla `{username} dice: {message}`, selector de voz, velocidad, límite de caracteres y antispam.
- Página de audio transparente en `/tts` para la Browser Source de OBS.
- Importación de configuración existente y almacenamiento separado de los archivos de instalación.

## Primer uso de Twitch

1. Abre [Twitch Developer Console](https://dev.twitch.tv/console/apps) y crea una aplicación para tu herramienta local.
2. Añade como OAuth Redirect URL exactamente la dirección que muestra NoteLive Studio, por defecto: \`http://localhost:8787/twitch/callback\`.
3. Copia el **Client ID** y el **Client Secret** a la sección Twitch de NoteLive Studio. El secreto queda en el archivo local de configuración y no se envía a las fuentes de navegador.
4. Pulsa **Conectar cuenta Twitch** y autoriza los permisos de lectura del chat y los seguidores. NoteLive usa EventSub por WebSocket para recibir \`channel.follow\` y \`channel.chat.message\`.
5. En OBS, añade fuentes de tipo **Navegador** con estas URL:
   - Alertas de follow: \`http://127.0.0.1:8787/twitch-overlay\`
   - Chat de Twitch: \`http://127.0.0.1:8787/twitch-chat-overlay\`
   - Voz ElevenLabs: \`http://127.0.0.1:8787/tts\`

La fuente de voz reutiliza los ajustes de ElevenLabs y la cola de voz existente. Mantén NoteLive Studio abierto durante el directo. Las credenciales y el token de Twitch se guardan localmente; el token está en \`twitch-tokens.json\` en modo desarrollo y en la carpeta de datos del usuario cuando se instala la aplicación.

## Comando de voz en Twitch

En **Chat general → Comando de voz de Twitch**, activa el comando `!voice`. En el chat de tu canal escribe, por ejemplo, `!voice Hola a todos`. NoteLive Studio lee solo la frase después del comando, usando la voz de ElevenLabs configurada. Por defecto, solo la cuenta del streamer puede activar esta función; puedes habilitar el uso por moderadores desde los ajustes. Mantén conectada la sesión de Twitch, ElevenLabs configurado y una fuente de navegador de audio apuntando a `http://127.0.0.1:8787/tts` activa en OBS.

Usa `!voice` como comando principal. También se detecta `/voice` si el cliente de Twitch entrega ese texto como mensaje normal, pero los comandos que empiezan con `/` pueden ser tratados de forma especial por Twitch y no siempre llegan a NoteLive. No se necesita permiso para enviar mensajes al chat.

## Primer uso de Spotify

En el panel, crea/usa una aplicación en https://developer.spotify.com/dashboard/ y registra este Redirect URI exactamente:

`http://127.0.0.1:8787/callback`

Copia el Client ID al panel y conecta la cuenta con Spotify. El flujo usa PKCE; no necesita un Client Secret. Revisa las políticas actuales de Spotify antes de mostrar contenido sincronizado en un directo público.

## Primer uso de ElevenLabs

Obtén una API key en https://elevenlabs.io/app/settings/api-keys, pégala en el panel, carga las voces y elige una. La clave se conserva en el servidor local y no se expone a OBS. Las solicitudes de voz consumen el límite/cuota aplicable a tu cuenta.

## Chat de TikTok LIVE

Introduce el nombre de usuario del directo sin `@` y pulsa Conectar chat. El conector `tiktok-live-connector` es comunitario, no oficial y está basado en la conexión Webcast interna; puede dejar de funcionar si TikTok cambia su protocolo. Lee `THIRD_PARTY_NOTICES.md`, la licencia del paquete y las condiciones de TikTok antes de redistribuir o usarlo comercialmente.

## URL para OBS

Con NoteLive Studio abierto, crea fuentes de tipo Navegador:

- Overlay musical: `http://127.0.0.1:8787/overlay` (520 × 100 px como inicio).
- Audio TTS: `http://127.0.0.1:8787/tts` (por ejemplo 300 × 80 px; activa “Controlar audio mediante OBS”).

Las fuentes dejan de funcionar si cierras NoteLive Studio porque el servidor local forma parte de la aplicación. Si el puerto 8787 ya está ocupado, cierra la antigua versión web iniciada con `start.bat` antes de abrir la app.

## Personalizar el fondo y la interfaz

Abre el apartado **Personalizar** desde la barra lateral derecha. Usa **Elegir imagen** para seleccionar el fondo de tu personaje, activa o desactiva el desenfoque y ajusta los deslizadores. La imagen se optimiza y se guarda localmente; no se sube a un servidor. La vista previa representa la interfaz de NoteLive Studio y no altera por sí sola la transparencia ni el diseño del overlay de OBS. Los apartados de Twitch y TikTok LIVE comparten un chat general para supervisar ambos canales sin salir de NoteLive Studio.

## Compilar desde el código fuente

- `npm install` — instalar dependencias.
- `npm start` — ejecutar la app de escritorio en desarrollo.
- `npm run dist` — crear el instalador NSIS de Windows x64.
- `npm run dist:portable` — intentar generar una versión portable de Windows.

La compilación incluye Electron y sus dependencias; el instalador puede ocupar varios cientos de MB. La primera instalación de las dependencias requiere conexión a Internet.


## Actualizaciones automáticas (configuración inicial)

NoteLive Studio incluye `electron-updater`, pero los updates solo funcionan una vez publicado el instalador y configurado un feed real. Consulta `.github/RELEASE-INSTRUCTIONS.md`. Se debe configurar el propietario del repositorio tanto en `update-config.json` como en `package.json` (`build.publish`). La app instalada comprueba actualizaciones al arrancar y cada seis horas. Al buscar manualmente verás el estado en el panel, con el progreso de descarga y un botón “Reiniciar para instalar” cuando esté listo. El feed sencillo usa GitHub Releases público.


### Importante si ya instalaste la 0.3.0 anterior

La primera build 0.3.0 que instalaste no contiene el módulo de autoactualización. Debes instalar una sola vez el instalador que genera este proyecto (también versión 0.3.0) para incorporar el actualizador. No hace falta pasar a 0.4.0. Las mejoras posteriores podrán publicarse como 0.3.1, 0.3.2, etc.


### Publicar la base inicial v0.3.0

Extrae el ZIP completo `NoteLive-Studio-v0.3.0-auto-updates-source-FIX2.zip` a una carpeta nueva. Ejecuta `SUBIR-A-GITHUB.bat` desde esa carpeta. No copies el BAT a un proyecto antiguo ni a `C:\Program Files`. El script valida `package.json`, `desktop/main.cjs`, `electron-updater` y el workflow usando PowerShell (no depende de sintaxis moderna de Node para esta comprobacion).
