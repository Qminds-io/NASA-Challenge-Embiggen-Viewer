Embiggen Viewer
===================================

Visualizador web para **Tierra y cuerpos del Sistema Solar** que integra **capas NASA GIBS** (satélite) y **NASA Solar System Treks** (planetas/lunas), con herramientas de **anotación**, **exportación GeoJSON**, **permalinks** y **UI responsiva**.

* * * * *

Qué hace
--------

-   Muestra imágenes satelitales de **Tierra** (diurnas, nocturnas y mosaicos estáticos) desde **NASA GIBS**.

-   Muestra mosaicos globales de **Luna, Marte y Ceres** desde **NASA Solar System Treks**.

-   Permite **anotar** puntos y polígonos, **renombrar**, **editar**, **borrar**, **copiar coordenadas** y **importar/exportar** a **GeoJSON**.

-   Guarda la vista en la URL (hash) para **compartir** ubicación, zoom, fecha y capa.

-   Cambia **automáticamente** de proyección según el origen (**EPSG:3857** para GIBS, **EPSG:4326** para Treks).

-   Barra de progreso y contador de **errores** durante la carga de teselas.

* * * * *

Instalacion
-----------

1.  Requisitos: Node.js 18 o superior (recomendado 20). Ten a mano un gestor de paquetes: pnpm, yarn o npm.

2.  Clonar el repositorio: entra a tu terminal, ve a la carpeta donde trabajarás y ejecuta: git clone <URL de tu repo>. Luego entra a la carpeta del proyecto con: cd <carpeta del repo>.

3.  Instalar dependencias:

-   Con pnpm: pnpm install

-   Con yarn: yarn

-   Con npm: npm install

4.  Ejecutar en desarrollo:

-   Con pnpm: pnpm dev

-   Con yarn: yarn dev

-   Con npm: npm run dev\
    Abre el navegador en la URL que muestre Vite (normalmente <http://localhost:5173>[](http://localhost:5173))

* * * * *

Tecnologías y librerías
-----------------------

-   **React + Vite + TypeScript**: SPA rápida, tipada y modular.

-   **OpenLayers**: motor cartográfico (Map, View, TileLayer, VectorLayer, XYZ, WMTS, Draw/Modify/Select, GeoJSON).

-   **Tailwind CSS**: diseño limpio y responsivo para Navbar y panel lateral.

-   **OSM**: base visual solo cuando la proyección es EPSG:3857 (Tierra).

* * * * *

Fuentes de datos
----------------

-   **NASA GIBS** (Tierra): servicios WMTS disponibles en formato estilo-REST compatible con XYZ. Algunas capas son **diarias** (requieren fecha), otras **estáticas**.

-   **NASA Solar System Treks** (Luna, Marte, Ceres): servicios **WMTS** globales, consumidos con rejilla WMTS en **EPSG:4326**. Se usan endpoints **probados** y estables para evitar problemas de CORS o 404.

> Atribución visible: "Imagery © NASA EOSDIS GIBS / Worldview - NASA Solar System Treks".\
> Respetar términos de uso de cada fuente.

* * * * *

Estructura y arquitectura
-------------------------

-   **Pantalla de selección de cuerpo** (planeta/luna): el usuario primero elige el cuerpo; luego se abre el **viewer** con solo las capas válidas para ese cuerpo.

-   **Viewer** (Map): maneja la lógica de proyección, capa activa, fecha (para GIBS), opacidad, anotaciones y permalinks.

-   **Navbar**: selector de **capa** (y fecha para GIBS), modos de **anotación** (Punto/Polígono/Ninguno), **Editar/Borrar**, **Opacidad**, **Exportar/Importar GeoJSON**, **Recentrar**, y lectura de **coordenadas de cursor**.

* * * * *

Cómo se usa (alto nivel)
------------------------

1.  Instala dependencias con tu gestor habitual y ejecuta el entorno de desarrollo.

2.  Abre la app en el navegador.

3.  Elige un **cuerpo** (Tierra, Luna, Marte, Ceres).

4.  Selecciona la **capa** disponible para ese cuerpo.

5.  (Solo GIBS) elige la **fecha**.

6.  Dibuja **anotaciones** (P o G), edita (E), borra (Supr), exporta **GeoJSON** o impórtalo.

7.  Comparte la URL: incluye **lon/lat**, **zoom**, **fecha**, **capa** y **proyección**.

**Atajos:** P (Punto), G (Polígono), N (Ninguno), E (Editar), Supr (Borrar), R (Recentrar).

* * * * *

Decisiones clave (justificación)
--------------------------------

-   **OpenLayers**: soporte robusto para WMTS/XYZ y control fino de proyecciones e interacciones.

-   **Separación cuerpo/capa**: simplifica la UX y evita inconsistencias (p. ej., no mostrar capas de Marte cuando el cuerpo es Luna).

-   **WMTS REST para Treks**: se priorizan endpoints verificados para minimizar CORS/404; cuando un cuerpo no expone CORS de forma estable, se omite.

-   **Permalinks**: facilitan reproducibilidad y comunicación (requisito habitual en visualización de datos).

* * * * *

Añadir nuevas capas (sin código)
--------------------------------

**GIBS (Tierra):**

1.  Localiza el **ID** de la capa y su **matrixSet** (Level9 o Level8).

2.  Comprueba si es **diaria** (necesita fecha) o **estática**.

3.  Añádela a la lista de capas de Tierra (mismo formato que las existentes).

**Treks (Luna/Marte/Ceres):**

1.  Verifica que el endpoint de mosaico global exista y devuelva teselas (sin 404/CORS).

2.  Anota el nombre de la capa (endpoint base), el **formato** (jpg/png) y un **maxZoom** razonable.

3.  Añádela en la lista del cuerpo correspondiente.

> Si una capa falla por CORS/404, sustitúyela por otra del mismo cuerpo que esté disponible públicamente.

* * * * *

Cumplimiento Space Apps
-----------------------

-   **Datos abiertos NASA**: GIBS y Treks.

-   **Impacto educativo**: capas relevantes (True Color, nocturnas, mosaicos globales) y anotaciones compartibles.

-   **Reproducibilidad**: app sin credenciales, con permalinks y documentación clara.

-   **Escalabilidad**: fácil ampliar cuerpos y capas.

* * * * *

Licencias y créditos
--------------------

-   **Código**: licencia abierta (ej. MIT).

-   **Imágenes/datos**: según términos de **NASA EOSDIS GIBS / Worldview**, **NASA Solar System Treks** y **OSM** (si se usa base en 3857).

-   Mostrar siempre la **atribución** correspondiente en la interfaz.

* * * * *

Hoja de ruta (sugerida)
-----------------------

-   Añadir más cuerpos Treks cuando existan endpoints públicos estables.

-   Herramientas de medición y comparación de capas (swipe).

-   "Historias" guiadas con anotaciones y enlaces compartibles.