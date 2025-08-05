/* ---------------------------------------------------------------
 * mapUtils.js · utilidades genéricas para Mapbox
 * ------------------------------------------------------------- */
import * as turf from '@turf/turf';

/**
 * Centra el mapa sobre un conjunto de features y, opcionalmente,
 * coloca / actualiza un Marker.
 *
 * @param {mapboxgl.Map} map        Instancia de mapa
 * @param {Array}        features   GeoJSON Feature[]  (al menos 1)
 * @param {React.Ref}    markerRef  Ref opcional a un Marker reutilizable
 */
export function highlightAndZoom(map, features = [], markerRef = null) {
  if (!map || !features.length) return;

  /* 1. Ajustar vista */
  const bbox = turf.bbox(
    features.length === 1
      ? features[0]
      : { type: 'FeatureCollection', features }
  );
  map.fitBounds(
    [
      [bbox[0], bbox[1]],
      [bbox[2], bbox[3]],
    ],
    { padding: 60, maxZoom: 18 }
  );

  /* 2. Opcional: colocar un pin en el centroide del primer feature */
  if (markerRef && markerRef.current) {
    markerRef.current.remove();
    markerRef.current = null;
  }
  if (markerRef) {
    const [lng, lat] = turf.centroid(features[0]).geometry.coordinates;
    // crea sólo si el GeoJSON tiene geometría válida tipo Point/Polygon
    if (!isNaN(lng) && !isNaN(lat)) {
      // eslint-disable-next-line new-cap
      markerRef.current = new mapboxgl.Marker({ color: '#FF3333' })
        .setLngLat([lng, lat])
        .addTo(map);
    }
  }
}
