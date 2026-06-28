// Initialisation de la carte (Leaflet)
let map, marker, polyline;
let trackPoints = [];

document.addEventListener('DOMContentLoaded', () => {
  // Initialisation Map centrée sur la France par défaut
  map = L.map('map').setView([46.603354, 1.888334], 5);
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  marker = L.marker([46.603354, 1.888334]).addTo(map);
  
  // Polyline pour dessiner la trajectoire du tracker (limité à 50 points)
  polyline = L.polyline([], {
    color: '#00e5ff', // Cyan fluorescent assorti au thème
    weight: 3,
    opacity: 0.8,
    lineJoin: 'round'
  }).addTo(map);
  
  // Exposer updateMap globalement pour serial.js
  window.updateMap = (lat, lon, details) => {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if(!isNaN(latNum) && !isNaN(lonNum) && latNum !== 0 && lonNum !== 0) {
      const newLatLng = new L.LatLng(latNum, lonNum);
      
      // Déplacement du marqueur
      marker.setLatLng(newLatLng);
      map.setView(newLatLng, 15);
      
      // Ajout du point à la trajectoire
      trackPoints.push(newLatLng);
      if (trackPoints.length > 50) {
        trackPoints.shift(); // Anti-overflow : Conserver uniquement les 50 derniers points
      }
      
      // Mise à jour du tracé de la ligne sur la carte
      polyline.setLatLngs(trackPoints);
      
      // Mise à jour de l'infobulle popup dynamique
      if (details) {
        const lang = localStorage.getItem('wasp_lang') || 'fr';
        const fixText = details.gpsFix 
          ? (lang === 'en' ? 'Valid Fix' : 'Fix valide') 
          : (lang === 'en' ? 'No Fix' : 'Aucun Fix');
        
        const popupContent = `
          <div style="font-family: 'Outfit', sans-serif; color: #333; line-height: 1.4; padding: 0.2rem;">
            <b style="font-size: 1rem; color: #111;">Tracker WASP: ${details.tracker} (APID: ${details.apid})</b><br>
            <b>Altitude:</b> ${details.alt.toFixed(1)} m<br>
            <b>Vitesse:</b> ${details.spd.toFixed(1)} km/h<br>
            <b>Cap (COG):</b> ${details.cog.toFixed(1)}°<br>
            <b>GPS Fix:</b> ${fixText}<br>
            <b>Heure GPS:</b> ${details.time}
          </div>
        `;
        marker.bindPopup(popupContent).openPopup();
      }
    }
  };
});
