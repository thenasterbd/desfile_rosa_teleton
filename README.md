# Desfile Rosa · Teletón en vivo

SPA estática en español, HTML, CSS, Tailwind CDN y JavaScript ES Modules. Moneda: USD. Sin proceso de compilación. Esta herramienta registra aportes; no procesa pagos ni verifica transferencias.

## Probar en el entorno local

Desde la carpeta del repositorio:

```sh
python -m http.server 4173 --bind 0.0.0.0
```

Abre el servidor con un navegador moderno. No abras index.html como archivo: los módulos requieren HTTP. Las vistas usan `#proyector`, `#operador` y `#ajustes`. La demostración comienza en cero; registra aportes, cambia la meta y prueba el reinicio. Dos pestañas del mismo origen se sincronizan mediante almacenamiento local y Web Locks. El demo no sincroniza computadoras, perfiles o navegadores distintos. El almacenamiento privado/restringido puede impedir su funcionamiento. El modo demo está siempre identificado y no es adecuado para el evento real.

## Firebase para un evento real

1. Crea un proyecto en Firebase Console y registra una aplicación web. Crea Firestore en modo producción; selecciona una región cercana a tu audiencia. No actives reglas de prueba abiertas.
2. En Firestore → Reglas, publica el contenido completo de `firestore.rules`.
3. En Authentication → Métodos de acceso, activa correo/contraseña. En Usuarios, crea las cuentas de tus operadores. Nunca publiques contraseñas.
4. Para cada operador, copia su UID de Authentication. Desde la consola de Firestore crea un documento `admins/UID` con el campo booleano `enabled: true`. La existencia del documento autoriza; elimínalo para revocar acceso. Ningún cliente puede crear estos documentos. No es necesario dar permisos administrativos de Firebase a operadores.
5. Copia el objeto de configuración **pública web** del proyecto. Para todos los dispositivos, sustituye el `null` de `firebaseConfig` en `js/firebase-config.js` por ese objeto real. No incluyas cuentas de servicio ni claves privadas. Alternativamente, pégalo como JSON en Meta y ajustes → Conectar mi proyecto Firebase en cada navegador (se guarda solo en ese navegador y tiene menor prioridad que la configuración del archivo).
6. Añade el dominio publicado a Authentication → Configuración → Dominios autorizados. Usa el mismo proyecto en todos los dispositivos.
7. Recarga, inicia sesión como operador desde Meta y ajustes y guarda la meta para inicializar el evento. Abre la vista proyector en otro dispositivo: es de lectura pública y no requiere sesión. Registra un aporte y comprueba la actualización en ambas pantallas.

La configuración pública identifica el proyecto; las reglas y Authentication protegen las escrituras. El total se mantiene mediante transacciones con importes enteros en centavos y un identificador de aporte para evitar duplicados al reintentar el mismo envío. Las transacciones requieren conexión al servidor: no se promete que un aporte desconectado esté guardado. `onSnapshot` entrega cambios sin recargar; el tiempo efectivo depende de la red y Firebase, no se garantiza menos de un segundo. La interfaz distingue datos en caché de una conexión activa.

Solo se escuchan el resumen y los últimos 30 aportes del evento. Los reinicios crean otra generación y conservan el historial anterior en Firestore; la demo conserva solo los últimos 30 aportes del evento activo. Los nombres y mensajes son públicos: informa a los donantes y no registres información sensible. No hay un límite de consultas por parte del cliente: supervisa las cuotas, costes y abuso en Firebase; considera App Check antes de eventos de gran audiencia. Las cuentas autorizadas son de confianza y tienen control de la meta y del total. Las reglas no sustituyen una auditoría de recaudación.

## Publicar con GitHub Pages

El flujo `.github/workflows/pages.yml` publica únicamente `index.html`, `css/` y `js/` al subir cambios a `main`. En el repositorio GitHub → Settings → Pages, elige **GitHub Actions** como origen. Después ejecuta el flujo “Publicar Desfile Rosa” o envía un commit a main. Si el repositorio es privado, comprueba que tu plan admite Pages. GitHub proporciona alojamiento estático HTTPS; Firebase proporciona la base de datos. No hay un servidor Node que administrar ni se necesita Vercel.

Configura Firebase antes de publicar para uso real. El despliegue de Pages **no publica las reglas de Firestore**: hazlo en la consola o con Firebase CLI autenticado (`firebase deploy --only firestore:rules --project TU_ID_REAL`). No incluyas autenticación de Firebase CLI en GitHub ni en el repositorio.

## Proyección y dependencias

Activa el sonido en cada proyector y haz clic en la página para que el navegador autorice Web Audio. El primer snapshot no reproduce sonido ni confetti; sí lo hacen los aportes posteriores y el cruce de la meta. Pantalla completa requiere un gesto del usuario. La preferencia de movimiento reducido desactiva confetti y animaciones.

Firebase usa módulos v10.14.1 desde www.gstatic.com, confetti v1.9.3 desde cdn.jsdelivr.net, Tailwind v3.4.17 desde cdn.tailwindcss.com y tipografías de Google Fonts. Los estilos de la aplicación están completos en CSS: si Tailwind o las fuentes no cargan, la interfaz sigue funcionando. Sin Firebase CDN no puede conectarse al backend; sin confetti CDN se omite únicamente ese efecto. El CDN de Tailwind se incluye por requisito, pero su compilación en navegador no es la opción recomendada para un despliegue endurecido de alto tráfico.

## Verificación antes del evento

Comprueba con el proyecto real: permisos de lectura pública y rechazo de escritura sin operador, dos dispositivos simultáneos, suma concurrente, meta, sonido, cruce al 100%, desconexión/reconexión y reinicio. El modo demo no valida Firebase. Conserva un registro externo de pagos para conciliación. El contador no confirma la recepción bancaria de los aportes.
