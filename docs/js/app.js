// Initialisation de la carte (Leaflet)
let map, marker;

document.addEventListener('DOMContentLoaded', () => {
  // Initialisation Map centrée sur la France par défaut
  map = L.map('map').setView([46.603354, 1.888334], 5);
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  marker = L.marker([46.603354, 1.888334]).addTo(map);
  
  // Exposer updateMapGlobalement pour serial.js
  window.updateMap = (lat, lon) => {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if(!isNaN(latNum) && !isNaN(lonNum) && latNum !== 0 && lonNum !== 0) {
      const newLatLng = new L.LatLng(latNum, lonNum);
      marker.setLatLng(newLatLng);
      map.setView(newLatLng, 15);
    }
  };
});
