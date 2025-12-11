import "leaflet/dist/leaflet.css";
import "leaflet-contextmenu/dist/leaflet.contextmenu.css";
import "leaflet-contextmenu";

import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import * as L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, ScaleControl, TileLayer } from "react-leaflet";
import { toast } from "react-toastify";

import {
    additionalMapGeoLocations,
    addQuestion,
    animateMapMovements,
    autoZoom,
    followMe,
    hiderMode,
    highlightTrainLines,
    isLoading,
    leafletMapContext,
    mapGeoJSON,
    mapGeoLocation,
    planningModeEnabled,
    polyGeoJSON,
    questionFinishedMapData,
    questions,
    simulatedSeekerMode,
    thunderforestApiKey,
    triggerLocalRefresh,
} from "@/lib/context";
import { cn } from "@/lib/utils";
import { applyQuestionsToMapGeoData, holedMask } from "@/maps";
import { hiderifyQuestion } from "@/maps";
import { clearCache, determineMapBoundaries } from "@/maps/api";

import { DraggableMarkers } from "./DraggableMarkers";
import { LeafletFullScreenButton } from "./LeafletFullScreenButton";
import { MapPrint } from "./MapPrint";
import { MeasureTool } from "./MeasureTool";
import { SimulatedSeekerTimer } from "./SimulatedSeekerTimerAnim";
import { PolygonDraw } from "./PolygonDraw";

export const Map = ({ className }: { className?: string }) => {
    useStore(additionalMapGeoLocations);
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $questions = useStore(questions);
    const $highlightTrainLines = useStore(highlightTrainLines);
    const $thunderforestApiKey = useStore(thunderforestApiKey);
    const $hiderMode = useStore(hiderMode);
    const $isLoading = useStore(isLoading);
    const $followMe = useStore(followMe);
    const $simulatedSeekerMode = useStore(simulatedSeekerMode);
    const map = useStore(leafletMapContext);

    const followMeMarkerRef = useMemo(
        () => ({ current: null as L.Marker | null }),
        [],
    );
    const geoWatchIdRef = useMemo(
        () => ({ current: null as number | null }),
        [],
    );

    const trainLayersRef = useRef<{
        lines?: L.GeoJSON | null;
        stations?: L.GeoJSON | null;
    }>({ lines: null, stations: null });
    const stationCircleRef = useRef<L.Circle | null>(null);
    const mapColorFromToken = (token: string | undefined) => {
        if (!token) return "#000000";
        const base = token.split(/[-,]/)[0];
        const colors: Record<string, string> = {
            red: "#D32F2F",
            green: "#2E7D32",
            blue: "#1976D2",
            yellow: "#FBC02D",
            brown: "#6D4C41",
            purple: "#6A1B9A",
            gray: "#6B7280",
            orange: "#FB8C00",
            black: "#000000",
        };
        return colors[base] ?? base;
    };

    const refreshQuestions = async (focus: boolean = false) => {
        if (!map) return;

        if ($isLoading) return;

        isLoading.set(true);

        if ($questions.length === 0) {
            await clearCache();
        }

        let mapGeoData = mapGeoJSON.get();

        if (!mapGeoData) {
            const polyGeoData = polyGeoJSON.get();
            if (polyGeoData) {
                mapGeoData = polyGeoData;
                mapGeoJSON.set(polyGeoData);
            } else {
                await toast.promise(
                    determineMapBoundaries()
                        .then((x) => {
                            mapGeoJSON.set(x);
                            mapGeoData = x;
                        })
                        .catch((error) => console.log(error)),
                    {
                        error: "Error refreshing map data",
                    },
                );
            }
        }

        if ($hiderMode !== false) {
            for (const question of $questions) {
                await hiderifyQuestion(question);
            }

            triggerLocalRefresh.set(Math.random()); // Refresh the question sidebar with new information but not this map
        }

        map.eachLayer((layer: any) => {
            if (layer.questionKey || layer.questionKey === 0) {
                map.removeLayer(layer);
            }
        });

        try {
            mapGeoData = await applyQuestionsToMapGeoData(
                $questions,
                mapGeoData,
                planningModeEnabled.get(),
                (geoJSONObj, question) => {
                    const geoJSONPlane = L.geoJSON(geoJSONObj);
                    // @ts-expect-error This is a check such that only this type of layer is removed
                    geoJSONPlane.questionKey = question.key;
                    geoJSONPlane.addTo(map);
                },
            );

            mapGeoData = {
                type: "FeatureCollection",
                features: [holedMask(mapGeoData!)!],
            };

            map.eachLayer((layer: any) => {
                if (layer.eliminationGeoJSON) {
                    // Hopefully only geoJSON layers
                    map.removeLayer(layer);
                }
            });

            const g = L.geoJSON(mapGeoData);
            // @ts-expect-error This is a check such that only this type of layer is removed
            g.eliminationGeoJSON = true;
            g.addTo(map);

            questionFinishedMapData.set(mapGeoData);

            if (autoZoom.get() && focus) {
                const bbox = turf.bbox(holedMask(mapGeoData) as any);
                const bounds = [
                    [bbox[1], bbox[0]],
                    [bbox[3], bbox[2]],
                ];

                if (animateMapMovements.get()) {
                    map.flyToBounds(bounds as any);
                } else {
                    map.fitBounds(bounds as any);
                }
            }
        } catch (error) {
            console.log(error);

            isLoading.set(false);
            if (document.querySelectorAll(".Toastify__toast").length === 0) {
                return toast.error("No solutions found / error occurred");
            }
        } finally {
            isLoading.set(false);
        }
    };

    const displayMap = useMemo(
        () => (
            <MapContainer
                center={$mapGeoLocation.geometry.coordinates}
                zoom={12}
                className={cn("w-[500px] h-[500px]", className)}
                ref={leafletMapContext.set}
                // @ts-ignore Typing doesn't update from react-contextmenu
                contextmenu={true}
                contextmenuWidth={140}
                contextmenuItems={[
                    {
                        text: "Add Radius",
                        callback: (e: any) =>
                            addQuestion({
                                id: "radius",
                                data: {
                                    lat: e.latlng.lat,
                                    lng: e.latlng.lng,
                                },
                            }),
                    },
                    {
                        text: "Add Thermometer",
                        callback: (e: any) => {
                            const destination = turf.destination(
                                [e.latlng.lng, e.latlng.lat],
                                5,
                                90,
                                {
                                    units: "miles",
                                },
                            );

                            addQuestion({
                                id: "thermometer",
                                data: {
                                    latA: e.latlng.lat,
                                    lngA: e.latlng.lng,
                                    latB: destination.geometry.coordinates[1],
                                    lngB: destination.geometry.coordinates[0],
                                },
                            });
                        },
                    },
                    {
                        text: "Add Tentacles",
                        callback: (e: any) => {
                            addQuestion({
                                id: "tentacles",
                                data: {
                                    lat: e.latlng.lat,
                                    lng: e.latlng.lng,
                                    locationType: "museum",
                                },
                            });
                        },
                    },
                    {
                        text: "Add Matching",
                        callback: (e: any) => {
                            addQuestion({
                                id: "matching",
                                data: {
                                    lat: e.latlng.lat,
                                    lng: e.latlng.lng,
                                },
                            });
                        },
                    },
                    {
                        text: "Add Measuring",
                        callback: (e: any) => {
                            addQuestion({
                                id: "measuring",
                                data: {
                                    lat: e.latlng.lat,
                                    lng: e.latlng.lng,
                                },
                            });
                        },
                    },
                    {
                        text: "Copy Coordinates",
                        callback: (e: any) => {
                            if (!navigator || !navigator.clipboard) {
                                toast.error(
                                    "Clipboard API not supported in your browser",
                                );
                                return;
                            }

                            const latitude = e.latlng.lat;
                            const longitude = e.latlng.lng;

                            toast.promise(
                                navigator.clipboard.writeText(
                                    `${Math.abs(latitude)}°${latitude > 0 ? "N" : "S"}, ${Math.abs(
                                        longitude,
                                    )}°${longitude > 0 ? "E" : "W"}`,
                                ),
                                {
                                    pending: "Writing to clipboard...",
                                    success: "Coordinates copied!",
                                    error: "An error occurred while copying",
                                },
                                { autoClose: 1000 },
                            );
                        },
                    },
                ]}
            >
                {!($highlightTrainLines && $thunderforestApiKey) && (
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="https://carto.com/attributions">CARTO</a>; &copy; <a href="http://www.thunderforest.com/">Thunderforest</a>; Powered by Esri and Turf.js'
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                        subdomains="abcd"
                        maxZoom={20} // This technically should be 6, but once the ratelimiting starts this can take over
                        minZoom={2}
                        noWrap
                    />
                )}
                {$highlightTrainLines && $thunderforestApiKey && (
                    <TileLayer
                        url={`https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=${$thunderforestApiKey}`}
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; &copy; <a href="https://carto.com/attributions">CARTO</a>; &copy; <a href="http://www.thunderforest.com/">Thunderforest</a>; Powered by Esri and Turf.js'
                        maxZoom={22}
                        minZoom={2}
                        noWrap
                    />
                )}
                <DraggableMarkers />
                <div className="leaflet-top leaflet-right">
                    <div className="leaflet-control flex-col flex gap-2">
                        <LeafletFullScreenButton />
                        <MeasureTool />
                        {$simulatedSeekerMode !== false && <SimulatedSeekerTimer />}
                    </div>
                </div>
                <PolygonDraw />
                <ScaleControl position="bottomleft" />
                <MapPrint
                    position="topright"
                    sizeModes={["Current", "A4Portrait", "A4Landscape"]}
                    hideControlContainer={false}
                    hideClasses={[
                        "leaflet-full-screen-specific-name",
                        "leaflet-top",
                        "leaflet-control-easyPrint",
                        "leaflet-draw",
                    ]}
                    title="Print"
                />
            </MapContainer>
        ),
        [map, $highlightTrainLines, $thunderforestApiKey, $simulatedSeekerMode],
    );

    useEffect(() => {
        if (!map) return;
        refreshQuestions(true);
    }, [$questions, map, $hiderMode]);

    useEffect(() => {
        const intervalId = setInterval(async () => {
            if (!map) return;
            let layerCount = 0;
            map.eachLayer((layer: any) => {
                if (layer.eliminationGeoJSON) {
                    // Hopefully only geoJSON layers
                    layerCount++;
                }
            });
            if (layerCount > 1) {
                console.log("Too many layers, refreshing...");
                refreshQuestions(false);
            }
        }, 1000);

        return () => clearInterval(intervalId);
    }, [map]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            const mainElement: HTMLElement | null =
                document.querySelector("main");

            if (mainElement) {
                if (document.fullscreenElement) {
                    mainElement.classList.add("fullscreen");
                } else {
                    mainElement.classList.remove("fullscreen");
                }
            }
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);

        return () => {
            document.removeEventListener(
                "fullscreenchange",
                handleFullscreenChange,
            );
        };
    }, []);

    useEffect(() => {
        if (!map) return;
        if (!$followMe) {
            if (followMeMarkerRef.current) {
                map.removeLayer(followMeMarkerRef.current);
                followMeMarkerRef.current = null;
            }
            if (geoWatchIdRef.current !== null && geoWatchIdRef.current !== -1) {
                navigator.geolocation.clearWatch(geoWatchIdRef.current);
                geoWatchIdRef.current = null;
            } else if (geoWatchIdRef.current === -1) {
                geoWatchIdRef.current = null;
            }
            return;
        }

        // If simulated seeker mode is enabled, use simulated position without requesting GPS
        if ($simulatedSeekerMode !== false) {
            const lat = $simulatedSeekerMode.latitude;
            const lng = $simulatedSeekerMode.longitude;

            if (followMeMarkerRef.current) {
                followMeMarkerRef.current.setLatLng([lat, lng]);
            } else {
                const marker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        html: `<div class="text-blue-700 bg-white rounded-full border-2 border-blue-700 shadow w-5 h-5 flex items-center justify-center"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#2A81CB" opacity="0.5"/><circle cx="8" cy="8" r="3" fill="#2A81CB"/></svg></div>`,
                        className: "",
                    }),
                    zIndexOffset: 1000,
                });
                marker.addTo(map);
                followMeMarkerRef.current = marker;
            }
            // Set a dummy watch ID to indicate we're "watching"
            geoWatchIdRef.current = -1;
            return;
        }

        // Normal GPS mode
        geoWatchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;

                if (followMeMarkerRef.current) {
                    followMeMarkerRef.current.setLatLng([lat, lng]);
                } else {
                    const marker = L.marker([lat, lng], {
                        icon: L.divIcon({
                            html: `<div class="text-blue-700 bg-white rounded-full border-2 border-blue-700 shadow w-5 h-5 flex items-center justify-center"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#2A81CB" opacity="0.5"/><circle cx="8" cy="8" r="3" fill="#2A81CB"/></svg></div>`,
                            className: "",
                        }),
                        zIndexOffset: 1000,
                    });
                    marker.addTo(map);
                    followMeMarkerRef.current = marker;
                }
            },
            () => {
                toast.error("Unable to access your location.");
                followMe.set(false);
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
        );
        return () => {
            if (followMeMarkerRef.current) {
                map.removeLayer(followMeMarkerRef.current);
                followMeMarkerRef.current = null;
            }
            if (geoWatchIdRef.current !== null && geoWatchIdRef.current !== -1) {
                navigator.geolocation.clearWatch(geoWatchIdRef.current);
                geoWatchIdRef.current = null;
            } else if (geoWatchIdRef.current === -1) {
                geoWatchIdRef.current = null;
            }
        };
    }, [$followMe, map, $simulatedSeekerMode]);

    // Toggle MRT lines/stations overlay based on highlightTrainLines
    useEffect(() => {
        if (!map) return;

        const removeTrainLayers = () => {
            try {
                if (trainLayersRef.current.lines) {
                    map.removeLayer(trainLayersRef.current.lines);
                    trainLayersRef.current.lines = null;
                }
                if (trainLayersRef.current.stations) {
                    map.removeLayer(trainLayersRef.current.stations);
                    trainLayersRef.current.stations = null;
                }
                if (stationCircleRef.current) {
                    try {
                        map.removeLayer(stationCircleRef.current);
                    } catch (err) {
                        // ignore
                    }
                    stationCircleRef.current = null;
                }
            } catch (err) {
                // Swallow - map may be destroyed
            }
        };

        const loadGeoJSON = async () => {
            try {
                const resp = await fetch("/sgmrt.geojson");
                if (!resp.ok) return;
                const geo = await resp.json();

                // Lines (LineString / MultiLineString)
                const linesLayer = L.geoJSON(geo, {
                    filter(feature) {
                        return (
                            feature.geometry &&
                            (feature.geometry.type === "LineString" ||
                                feature.geometry.type === "MultiLineString")
                        );
                    },
                    style(feature: any) {
                        const color = mapColorFromToken(
                            feature?.properties?.line_color || feature?.properties?.color,
                        );
                        return {
                            color,
                            weight: 4,
                            opacity: 0.85,
                            // Slightly offset to make lines visible over base tiles
                        } as any;
                    },
                });

                // Stations (Point)
                const stationLayer = L.geoJSON(geo, {
                    filter(feature) {
                        return (
                            feature.geometry && feature.geometry.type === "Point" && feature.properties.network === "singapore-mrt"
                        );
                    },
                    pointToLayer(geoJsonPoint, latlng) {
                        const color = mapColorFromToken(
                            geoJsonPoint.properties?.station_colors || geoJsonPoint.properties?.color,
                        );

                        const marker = L.circleMarker(latlng, {
                            radius: 5,
                            color: color,
                            fillColor: color,
                            weight: 1,
                            opacity: 1,
                            fillOpacity: 1,
                        });

                        const name =
                            geoJsonPoint.properties["name:en"] ||
                            geoJsonPoint.properties.name ||
                            "Untitled Station";

                        marker.bindPopup(`<b>${name}</b>`);

                        // When the station marker is clicked, draw a 400m radius
                        marker.on("click", () => {
                            try {
                                if (!map) return;
                                // Remove existing station circle
                                if (stationCircleRef.current) {
                                    try {
                                        map.removeLayer(stationCircleRef.current);
                                    } catch (err) {
                                        /* ignore */
                                    }
                                    stationCircleRef.current = null;
                                }

                                // Create a new circle with 400m radius
                                const newCircle = L.circle(latlng, {
                                    radius: 400,
                                    color,
                                    fillColor: color,
                                    fillOpacity: 0.12,
                                    weight: 2,
                                });
                                newCircle.addTo(map);
                                stationCircleRef.current = newCircle;
                            } catch (err) {
                                console.warn("Error drawing station circle", err);
                            }
                        });

                        return marker;
                    },
                });

                // Attach markers and layers to the map if the component is still alive
                if ($highlightTrainLines) {
                    trainLayersRef.current.lines = linesLayer.addTo(map);
                    trainLayersRef.current.stations = stationLayer.addTo(map);
                }
            } catch (error) {
                console.warn("Could not load sgmrt.geojson", error);
            }
        };

        if ($highlightTrainLines) {
            // remove existing just in case
            removeTrainLayers();
            loadGeoJSON();
        } else {
            removeTrainLayers();
        }

        return () => {
            try {
                if (trainLayersRef.current.lines) {
                    map.removeLayer(trainLayersRef.current.lines);
                    trainLayersRef.current.lines = null;
                }
                if (trainLayersRef.current.stations) {
                    map.removeLayer(trainLayersRef.current.stations);
                    trainLayersRef.current.stations = null;
                }
            } catch (err) {
                /* noop */
            }
        };
    }, [$highlightTrainLines, map]);

    return displayMap;
};
