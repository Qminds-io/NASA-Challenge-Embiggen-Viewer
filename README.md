Embiggen Viewer
================

Web viewer for Earth and Solar System bodies that combines NASA GIBS satellite layers with NASA Solar System Treks mosaics. The app ships annotation tools, GeoJSON import/export, sharable permalinks, and a responsive UI ready for touch or desktop.

-----

What It Does
------------

- Displays daily and static imagery for Earth (daytime, night, and composite mosaics) from NASA GIBS.
- Shows global mosaics for the Moon, Mars, and Ceres from NASA Solar System Treks.
- Lets you annotate points and polygons, rename, edit, delete, copy coordinates, and import/export GeoJSON.
- Persists view state in the URL hash so you can share location, zoom, date, and layer.
- Switches projections automatically (EPSG:3857 for GIBS, EPSG:4326 for Treks).
- Surface a progress indicator and tile error counter while requests are pending.

-----

Tech Stack
----------

- **React + Vite + TypeScript**: fast SPA with type safety and modular structure.
- **OpenLayers**: mapping engine (Map, View, TileLayer, VectorLayer, XYZ, WMTS, Draw/Modify/Select, GeoJSON).
- **Tailwind CSS**: clean, responsive layout for the navbar and side panel.
- **OSM**: optional basemap whenever the projection is EPSG:3857 (Earth).

-----

Data Sources
------------

- **NASA GIBS** (Earth): WMTS services available as REST-style XYZ endpoints. Some layers are daily (require a date), others are static.
- **NASA Solar System Treks** (Moon, Mars, Ceres): global WMTS mosaics consumed with EPSG:4326 tile grids. Verified, stable endpoints are used to avoid CORS/404 issues.

> Attribution to display: "Imagery © NASA EOSDIS GIBS / Worldview - NASA Solar System Treks". Respect the usage terms for each source.

-----

Architecture Overview
---------------------

- **Body picker screen**: users choose a planet/moon first; the viewer then loads with layers valid for that body.
- **Viewer (Map component)**: handles projection changes, active layer, date (for GIBS), opacity, annotations, and permalinks.
- **Navbar**: layer selector (plus date for GIBS), annotation modes (Point/Polygon/None), edit/delete toggles, opacity slider, GeoJSON export/import, recenter action, and live cursor coordinates.

-----

Usage (High Level)
------------------

1. Install dependencies with your usual package manager and run the dev server.
2. Open the app in the browser.
3. Pick a body (Earth, Moon, Mars, Ceres).
4. Select the layer shown for that body.
5. Choose a date when the layer requires one (GIBS daily products).
6. Draw annotations (P or G), edit (E), delete (Del), export GeoJSON or import one.
7. Share the URL; it captures lon/lat, zoom, date, layer, and projection.

**Shortcuts:** P (Point), G (Polygon), N (None), E (Edit), Del (Delete), R (Recenter).

-----

Key Decisions
-------------

- **OpenLayers** delivers robust WMTS/XYZ support and fine-grained control over projections and interactions.
- **Separate body/layer lists** simplify UX and avoid mismatches (no Mars layers while viewing the Moon).
- **WMTS REST for Treks** relies on pre-validated endpoints to minimize CORS/404 surprises.
- **Permalinks** keep sessions reproducible and easy to share—critical for data visualisation challenges.

-----

Add New Layers (No Code)
------------------------

**GIBS (Earth)**

1. Locate the layer ID and matrix set (Level9 or Level8).
2. Confirm whether it is daily (needs a date) or static.
3. Append it to the Earth layer list using the existing structure.

**Treks (Moon/Mars/Ceres)**

1. Verify that the global mosaic endpoint exists and serves tiles without 404/CORS issues.
2. Note the layer name (base endpoint), image format (jpg/png), and an appropriate maxZoom value.
3. Add it to the list for the corresponding body.

> If a layer fails because of CORS/404, swap it for another publicly available option for the same body.

-----

Space Apps Compliance
---------------------

- **NASA open data**: GIBS and Treks.
- **Educational impact**: noteworthy layers (True Color, night lights, global mosaics) and shareable annotations.
- **Reproducibility**: no credentials required, permalink support, clear docs.
- **Scalability**: straightforward to extend with more bodies and layers.

-----

Licenses and Credits
--------------------

- **Code**: open licence (e.g., MIT).
- **Imagery/data**: follow the terms for NASA EOSDIS GIBS / Worldview, NASA Solar System Treks, and OSM (when the 3857 basemap is used).
- Always surface the appropriate attribution in the interface.

-----

Suggested Roadmap
-----------------

- Add more Treks bodies as soon as stable public endpoints are available.
- Introduce measurement tools and layer comparison (swipe).
- Publish guided “stories” that bundle annotations with shareable links.


