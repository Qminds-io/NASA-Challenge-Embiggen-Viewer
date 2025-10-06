Embiggen Viewer
===================================
Web viewer for **Earth and Solar System bodies** that integrates **NASA GIBS layers** (satellite) and **NASA Solar System Treks** (planets/moons), with **annotation** tools, **GeoJSON export**, **permalinks**, and **responsive UI**.
* * * * *
What it does
--------
-   Displays satellite images of **Earth** (daytime, nighttime, and static mosaics) from **NASA GIBS**.
-   Displays global mosaics of **the Moon, Mars, and Ceres** from **NASA Solar System Treks**.
-   Allows you to **annotate** points and polygons, **rename**, **edit**, **delete**, **copy coordinates**, and **import/export** to **GeoJSON**.
-   Saves the view in the URL (hash) to **share** location, zoom, date, and layer.
-  **Automatically** changes projection based on source (**EPSG:3857** for GIBS, **EPSG:4326** for Treks).
-  Progress bar and **error** counter during tile loading.
* * * * *


Installation
-----------

1.  Requirements: Node.js 18 or higher (20 recommended). Have a package manager handy: pnpm, yarn, or npm.

2.  Clone the repository: open your terminal, go to the folder where you will be working, and run: git clone <URL of your repo>. Then enter the project folder with: cd <repo folder>.

3.  Install dependencies:

-   With pnpm: pnpm install

-   With yarn: yarn

-   With npm: npm install

4.  Run in development:

-   With pnpm: pnpm dev

-   With yarn: yarn dev

- With npm: npm run dev\
  Open your browser to the URL displayed by Vite (usually <http://localhost:5173>[](http://localhost:5173))

* * * * *

Technologies and libraries
-----------------------

- **React + Vite + TypeScript**: Fast, typed, and modular SPA.

- **OpenLayers**: Cartographic engine (Map, View, TileLayer, VectorLayer, XYZ, WMTS, Draw/Modify/Select, GeoJSON).

- **Tailwind CSS**: Clean and responsive design for Navbar and side panel.

-   **OSM**: visual base only when the projection is EPSG:3857 (Earth).

* * * * *

Data sources
----------------

-   **NASA GIBS** (Earth): WMTS services available in XYZ-compatible REST-style format. Some layers are **daily** (require date), others are **static**.

-   **NASA Solar System Treks** (Moon, Mars, Ceres): global **WMTS** services, consumed with WMTS grid in **EPSG:4326**. **Tested** and stable endpoints are used to avoid CORS or 404 issues.

> Visible attribution: "Imagery (c) NASA EOSDIS GIBS / Worldview - NASA Solar System Treks".\
> Respect the terms of use for each source.

* * * * *

Structure and architecture
-------------------------

-   **Body selection screen** (planet/moon): the user first chooses the body; then the **viewer** opens with only the layers valid for that body.

-   **Viewer** (Map): handles projection logic, active layer, date (for GIBS), opacity, annotations, and permalinks.

-   **Navbar**: **layer** selector (and date for GIBS), **annotation** modes (Point/Polygon/None), **Edit/Delete**, **Opacity**, **Export/Import GeoJSON**, **Refocus**, and **cursor coordinate** reading.

* * * * *

How to use (high level)
------------------------

1.  Install dependencies with your usual manager and run the development environment.

2.  Open the app in your browser.

3.  Choose a **body** (Earth, Moon, Mars, Ceres).

4.  Select the **layer** available for that body.

5.  (GIBS only) Choose the **date**.

6.  Draw **annotations** (P or G), edit (E), delete (Del), export **GeoJSON**, or import it.

7.  Share the URL: includes **lon/lat**, **zoom**, **date**, **layer**, and **projection**.

Shortcuts: P (Point), G (Polygon), N (None), E (Edit), Delete (Delete), R (Re-center).

* * * * *

Key decisions (justification)
--------------------------------

-   **OpenLayers**: robust support for WMTS/XYZ and fine control of projections and interactions.

-   **Body/layer separation**: simplifies the UX and avoids inconsistencies (e.g., not showing layers from Mars when the body is the Moon).

-   **WMTS REST for Treks**: verified endpoints are prioritized to minimize CORS/404; when a body does not expose CORS in a stable manner, it is omitted.

- **Permalinks**: facilitate reproducibility and communication (a common requirement in data visualization).

* * * * *

Space Apps Compliance
-----------------------

- **NASA open data**: GIBS and Treks.

-   **Educational impact**: relevant layers (True Color, nighttime, global mosaics) and shareable annotations.

-   **Reproducibility**: app without credentials, with permalinks and clear documentation.

-   **Scalability**: easy to expand bodies and layers.

* * * * *

Licenses and credits
--------------------

-   **Code**: open license (e.g., MIT).

-   **Images/data**: according to the terms of **NASA EOSDIS GIBS / Worldview**, **NASA Solar System Treks**, and **OSM** (if using base 3857).

-   Always display the corresponding **attribution** in the interface.

* * * * *

Roadmap (suggested)
-----------------------

-   Add more Treks bodies when stable public endpoints exist.

-   Layer measurement and comparison tools (swipe).

-   Guided "stories" with annotations and shareable links.

