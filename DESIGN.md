# Desfile Rosa — sistema visual

## Uso y prioridades

Una herramienta de recaudación para el evento Desfile Rosa 2026. El importe confirmado,
la meta y el último aporte deben leerse antes que los controles o la decoración.
La vista de operador prioriza velocidad, legibilidad y confirmación de escritura.
La proyección y los formularios usan la misma identidad, con densidades diferentes.

Se mantiene el fondo rosa claro elegido por el propietario, el logo de Rotaract
Valle de Santiago y la paleta proporcionada más recientemente por el propietario:
`#FC568D`, `#E02D69`, `#F93873` y `#FFFFFF`.

El blanco se usa en superficies, `#E02D69` en progreso e identidad, `#FC568D`
en detalles y foco suave, y `#F93873` en celebraciones y efectos. El fondo rosa
claro (`#FFF1F6`) y la superficie de recaudación (`#FFE2ED`) derivan de esta
paleta. Los textos usan una tinta ciruela para mantener el contraste. Los botones
con texto blanco usan `#D32660`, un derivado ligeramente más oscuro, para que las
etiquetas pequeñas alcancen contraste 4.5:1.

## Tipografías solicitadas

- Principal: **CocogooseProTrial**, servida localmente desde
  `assets/fonts/cocogoose/`. Las 15 variantes del ZIP proporcionado por el
  propietario están convertidas a WOFF2, conservando sus glifos, metadatos y pesos.
  Se incluyen Regular (400), Bold (700), Light (300), Semilight (350), Thin (100),
  Ultralight (200), Darkmode (370) y sus cursivas. Letterpress usa la familia
  independiente `CocogooseProLetterpressTrial`. La licencia original del paquete
  está incluida como `assets/fonts/cocogoose/License.pdf`.
  Los títulos usan Regular y los encabezados de panel Semilight.
- Secundaria: **Quicksand Book**, texto de lectura a peso 400 y controles a
  500–600. La familia variable Quicksand de Google Fonts está alojada en
  `assets/fonts/Quicksand.ttf`; su licencia OFL se incluye al lado del archivo.
- Números con cifras tabulares. Los montos largos reducen su tamaño sin ocultarse.
- Texto de lectura de 13–14 px; etiquetas y metadatos de 10–12 px. En proyección
  a pantalla completa se amplían importes, nombres y mensajes.

## Color y componentes

Las variables en `:root` de `css/styles.css` son la fuente de verdad.
El lienzo y las superficies son rosas muy claros; los textos usan un tono tinta
oscuro. El acento fuerte se concentra en la identidad, el progreso y la acción
principal. No se usan métricas, aportes ni nombres inventados en el evento real.

Retícula principal asimétrica: recaudación dominante y último aporte secundario.
El formulario y el historial comparten márgenes y controles de al menos 44 px.
Los iconos son SVG monolineales de 1.7 px, sin dependencias de iconografía.
Las superficies principales tienen radio 24 px y controles internos de 10 px.
No se añaden sombras o efectos de cristal sin una función de jerarquía.

Todos los controles tienen foco visible, hover y respuesta al pulsar. Los
formularios conservan los valores cuando hay errores. Durante un envío de aporte
se bloquea la edición para evitar que una confirmación borre datos recién escritos.
La navegación funciona con teclado e incluye un enlace para saltar al contenido.

## Estados de datos

Antes del primer snapshot se muestran datos pendientes, nunca un cero que parezca
confirmado. Si tarda más de 15 segundos, la interfaz informa del retraso. Los errores
mantienen un aviso visible con una acción para volver a conectar. Después de una
pérdida de conexión se conservan las últimas cifras conocidas y se muestra el aviso.

Sin aportes, el último aporte no presenta un monto ficticio de $0; ofrece un estado
vacío y acceso al operador. Con datos, muestra nombre, monto y mensaje reales.
El demo está identificado y sus datos no se envían a Supabase.

Los nuevos aportes disparan un vuelo de mariposas de `assets/butterfly.svg`, gestionado por `js/mariposas.js`. Las trayectorias van de abajo a la derecha hacia arriba a la izquierda, duran unos 6–9 segundos y no interceptan clics. Cada aporte genera 72 mariposas en escritorio o 40 en móvil, distribuidas en un abanico de trayectorias para cubrir la pantalla. Se permiten como máximo 160 mariposas simultáneas en escritorio y 80 en móvil y se limpian al terminar, al ocultar la pestaña o al reiniciar el evento. El primer snapshot y los cambios de meta no disparan el vuelo.

La animación de progreso y los vuelos usan transform; los movimientos respetan
`prefers-reduced-motion`. Las preferencias de sonido se mantienen por dispositivo.

## Referencias utilizadas

Este trabajo aplica la guía de rediseño de **OpenDesign** y sus reglas de oficio,
consultadas en el commit `4f69a426689bbd471c8f0774c13378e651ae7de8`:

- [redesign-existing-projects](https://github.com/nexu-io/open-design/blob/4f69a426689bbd471c8f0774c13378e651ae7de8/skills/redesign-skill/SKILL.md)
- [Tipografía](https://github.com/nexu-io/open-design/blob/4f69a426689bbd471c8f0774c13378e651ae7de8/craft/typography.md)
- [Color y contraste](https://github.com/nexu-io/open-design/blob/4f69a426689bbd471c8f0774c13378e651ae7de8/craft/color.md)
- [Estados de interfaz](https://github.com/nexu-io/open-design/blob/4f69a426689bbd471c8f0774c13378e651ae7de8/craft/state-coverage.md)
- [Patrones a evitar](https://github.com/nexu-io/open-design/blob/4f69a426689bbd471c8f0774c13378e651ae7de8/craft/anti-ai-slop.md)

Se usan como criterio de diseño, con código propio para esta SPA. No se ejecuta
el workspace de OpenDesign ni se agregan sus servicios como dependencia de la web.
El brief del propietario prevalece: rosa de marca y tipografías solicitadas. El favicon y el icono para guardar en dispositivos móviles usan el logo cuadrado de `assets/favicon-2026.png`. El logo del evento está en `assets/desfile-rosa-2026.png` y se muestra con fondo transparente en el encabezado, pie de página y proyector, conservando el logo de Rotaract como organizador.

## Validación

Revisión de las tres vistas entre 320 y 1920 px, pantalla completa, movimiento
reducido, carga pendiente, error y recuperación, historial vacío y poblado, nombres
largos y montos altos. Pruebas funcionales con el demo y respuestas REST controladas;
no se insertan aportes para estas pruebas en el proyecto real.

Contrastes calculados: texto secundario sobre fondo 5.99:1, texto secundario sobre
la superficie rosa 5.43:1 y texto principal sobre rosa 9.72:1. El contraste del
botón y de los bordes de control se verifica contra los mínimos de 4.5:1 y 3:1.
