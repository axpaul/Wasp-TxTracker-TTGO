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
      
      // Déclenchement de la pulsation glow sur l'icône du marqueur Leaflet
      if (marker && marker._icon) {
        const iconEl = marker._icon;
        iconEl.classList.remove('wasp-pulse');
        // Force reflow pour réinitialiser l'animation CSS
        void iconEl.offsetWidth;
        iconEl.classList.add('wasp-pulse');
      }
      
      // Ajout du point à la trajectoire
      trackPoints.push(newLatLng);
      const isFirstPoint = trackPoints.length === 1;
      
      if (trackPoints.length > 50) {
        trackPoints.shift(); // Anti-overflow : Conserver uniquement les 50 derniers points
      }
      
      // Mise à jour du tracé de la ligne sur la carte
      polyline.setLatLngs(trackPoints);
      
      // Gestion du recentrage intelligent de la carte
      const chkAutoCenter = document.getElementById('chk-auto-center');
      const shouldCenter = !chkAutoCenter || chkAutoCenter.checked;
      
      if (shouldCenter || isFirstPoint) {
        map.setView(newLatLng, isFirstPoint ? 15 : map.getZoom());
      }
      
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
        
        // Liaison ou mise à jour du contenu
        const isFirst = !marker.getPopup();
        marker.bindPopup(popupContent);
        
        // N'ouvre la popup automatiquement que pour le premier point.
        // Ensuite, on ne la met à jour en direct que si elle est déjà ouverte par l'utilisateur.
        if (isFirst) {
          marker.openPopup();
        } else if (marker.isPopupOpen()) {
          marker.setPopupContent(popupContent);
        }
      }
    }
  };
});
