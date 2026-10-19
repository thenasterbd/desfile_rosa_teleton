# Desfile Rosa · Teletón con Supabase

Aplicación estática en español con tres vistas, sin compilación, preparada para GitHub Pages. Moneda: USD. Registra aportes, no procesa pagos ni confirma transferencias bancarias.

## 1. Instalar la base de datos (solo una vez)

El proyecto público de Supabase ya está configurado en `js/supabase-config.js` con la URL y la clave publishable facilitadas por el propietario. Esa clave no es una contraseña administrativa. **Nunca** pongas una clave secret/service_role en estos archivos.

1. Abre tu proyecto en Supabase y entra a **SQL Editor → New query**.
2. Copia **todo** el archivo [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**. Debe terminar sin errores. Se crean:
   - `events`: meta, total en centavos y resumen del evento.
   - `donations`: aportes, vinculados a un evento.
   - `operators`: UUID de las cuentas autorizadas.
   - `app_settings`: referencia al evento activo.
3. El SQL activa RLS, permite lectura pública para el proyector, bloquea escrituras directas desde el navegador y activa Realtime para `events` y `app_settings`. Solo las funciones `register_donation`, `set_event_goal` y `reset_event` pueden modificar datos desde una cuenta autorizada.
4. Puedes volver a ejecutar el archivo para actualizar las funciones sin reiniciar la recaudación. Está diseñado para estas tablas nuevas; si ya creaste tablas con los mismos nombres y otra estructura, no las borres: revisa las diferencias antes de ejecutarlo.

## 2. Crear y autorizar a tu operador

1. En **Authentication → Users → Add user → Create new user**, crea una cuenta con correo y contraseña. Si aparece la opción, confirma el correo al crearla. No compartas la contraseña en el chat ni la guardes en GitHub.
2. Copia el **User UID** de esa cuenta.
3. En **Table Editor → operators → Insert row**, pega ese UUID en `user_id` y guarda. No necesitas rellenar otro campo. Crear una cuenta en Authentication por sí solo no autoriza operaciones.
4. Abre la web → **Meta y ajustes**, inicia sesión con esa cuenta y guarda la meta. Los visitantes pueden abrir el proyector sin iniciar sesión.
5. Para revocar un operador elimina su fila en `operators`. La base de datos rechaza inmediatamente las próximas escrituras aunque una pantalla aún muestre una sesión abierta. La app no incluye registro público; puedes desactivar nuevos registros en Authentication si no los necesitas.

Sin sesión autorizada, **Meta y ajustes** muestra únicamente el formulario de ingreso. **Panel operador** aparece en gris y lleva al formulario, incluso desde un enlace directo. Tras iniciar sesión se habilitan el panel, la meta y el reinicio. Puedes cerrar sesión desde el menú junto a **Meta y ajustes** o al pie de **Meta global**. El modo de prueba conserva los controles locales sin requerir una cuenta.

## 3. Publicar con GitHub Pages

En GitHub → **Settings → Pages**, selecciona **GitHub Actions** como origen. El workflow `.github/workflows/pages.yml` publica los archivos web y el SQL público cuando hay un push a `main`; también puedes ejecutarlo manualmente desde Actions. Comprueba que tu plan admite Pages si el repositorio es privado.

La publicación ejecuta `node scripts/build-site.mjs` (Node 20 o superior, sin instalar paquetes). El script crea `_site/` y añade la misma versión de contenido a la entrada y a todas las importaciones locales de JavaScript. Esto evita combinar HTML nuevo con módulos anteriores de la caché, incluidos archivos que todavía hacen referencia a elementos retirados. Los archivos originales del repositorio no se modifican. Puedes servir el resultado con `python -m http.server 4174 --directory _site` para probar la publicación localmente.

El despliegue de GitHub no ejecuta el SQL de Supabase. La instalación de la base de datos y la creación del operador se hacen en el panel de Supabase. GitHub aloja la web HTTPS; Supabase mantiene la base de datos y la conexión en vivo. No se necesita Vercel.

## Desarrollo y demo

Desde la carpeta del repositorio:

```sh
python -m http.server 4173 --bind 0.0.0.0
```

Abre la web mediante HTTP, nunca como archivo local. Las rutas de vistas son `#proyector`, `#operador` y `#ajustes`. Para una demostración sin base de datos usa `?demo=1#proyector` o el botón en ajustes. Está claramente marcada y solo sincroniza pestañas del mismo origen con localStorage y Web Locks. **Las donaciones del demo no se envían a Supabase**. Para volver al evento real, usa el botón “Ir al evento en vivo”.

## Integridad y sincronización

- Todos los montos son enteros en centavos. Las funciones SQL comprueban autorización y límites en el servidor.
- Cada aporte tiene un UUID. Los reintentos del mismo UUID y contenido no duplican el total. El operador conserva ese UUID si falla el envío y vuelve a intentarlo sin modificar sus campos.
- Las tres escrituras bloquean la fila del evento activo durante la transacción. Total, historial y último aporte se guardan juntos. Un aporte pendiente de un evento ya reiniciado se rechaza en vez de entrar al nuevo evento.
- `get_event_snapshot` devuelve total e historial consistentes en una única consulta, respetando RLS. El proyector usa Realtime, consulta de respaldo cada 10 segundos y refresco al recuperar visibilidad/conexión. El tiempo efectivo de sincronización depende de la red; no se garantiza menos de un segundo.
- Si una escritura queda confirmada pero falla su lectura posterior, la app avisa de la falta de conexión sin reenviar el aporte automáticamente. Si la respuesta de escritura se pierde, vuelve a intentar sin cambiar los datos para conservar el UUID.
- Reiniciar crea un evento nuevo con la misma meta y conserva los aportes anteriores en Supabase. Solo se muestran los últimos 30 del evento activo.
- Nombres, mensajes y eventos archivados son de lectura pública. No introduzcas datos sensibles e informa a los donantes. Los operadores son personas de confianza. Supervisa consumo, copias de seguridad, acceso y costes del proyecto antes del evento.

## Proyección

El sonido es una preferencia local. Actívalo con un clic en ajustes para autorizar Web Audio. La primera carga no celebra aportes históricos. Cada aporte nuevo activa mariposas rosadas con aleteo que vuelan desde abajo a la derecha hacia arriba a la izquierda, además del glow y el sonido. Al cruzar la meta también se lanza confetti. Cada aporte genera 72 mariposas en escritorio o 40 en móvil, en trayectorias amplias que recorren la pantalla. Las mariposas se retiran al terminar, al reiniciar el evento o al ocultar la pestaña, y se limita su cantidad durante ráfagas de aportes. El modo de movimiento reducido omite confetti y mariposas, y detiene los vuelos que ya estén activos. La pantalla completa requiere un gesto del usuario.

La identidad visual aplica las pautas de rediseño de OpenDesign, documentadas en [`DESIGN.md`](DESIGN.md). Se aplica la paleta `#FC568D`, `#E02D69`, `#F93873` y `#FFFFFF`, con un fondo rosa claro y el logo de Rotaract Valle de Santiago en `assets/rotaract-valle-de-santiago.png`. La fuente secundaria Quicksand Book se sirve localmente desde `assets/fonts/Quicksand.ttf`, con licencia OFL incluida. CocogooseProTrial se sirve desde `assets/fonts/cocogoose/`, con las 15 variantes WOFF2 convertidas del ZIP del propietario y su licencia original incluida. No requiere que el visitante tenga la fuente instalada. El logo Desfile Rosa 2026 está en `assets/desfile-rosa-2026.png` y aparece en la cabecera del proyector.

La aplicación importa Supabase JS 2.118.0 y canvas-confetti 1.9.3 desde cdn.jsdelivr.net, Tailwind 3.4.17 desde cdn.tailwindcss.com y no necesita fuentes externas en tiempo de ejecución. El CSS propio cubre la interfaz si Tailwind o las fuentes no cargan. Permite el dominio de tu proyecto Supabase y WebSocket HTTPS/WSS en la red de los dispositivos. Tailwind CDN se conserva por el requisito original; para tráfico elevado conviene compilarlo como recurso estático en un trabajo posterior.

## Verificación antes del evento

Tras ejecutar el SQL y crear el operador, abre dos dispositivos con el mismo proyecto, registra un aporte real de prueba y comprueba total, historial, meta y reinicio. Prueba también rechazo de escrituras sin sesión y con una cuenta no autorizada, desconexión/reconexión y acceso público del proyector. Las pruebas locales no demuestran que el SQL ya esté instalado en tu proyecto.
