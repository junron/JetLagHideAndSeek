import "maplibre-gl/dist/maplibre-gl.css";

import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

const CARTO_VOYAGER_STYLE =
    "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const CARTO_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="https://carto.com/attributions">CARTO</a>';

setWorkerUrl(workerUrl);

export const VectorBasemap = () => {
    const map = useMap();

    useEffect(() => {
        const layer = maplibreGL({
            style: CARTO_VOYAGER_STYLE,
            attributionControl: false,
            canvasContextAttributes: { preserveDrawingBuffer: true },
            renderWorldCopies: false,
            maxZoom: 20,
        }).addTo(map);
        map.attributionControl.addAttribution(CARTO_ATTRIBUTION);

        return () => {
            map.attributionControl.removeAttribution(CARTO_ATTRIBUTION);
            layer.remove();
        };
    }, [map]);

    return null;
};
