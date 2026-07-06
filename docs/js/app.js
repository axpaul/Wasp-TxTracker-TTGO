/**
 * @class WaspMap
 * @brief Composant de gestion de la carte Leaflet et du tracé de trajectoire.
 */
class WaspMap {
  constructor(mapId) {
    this.mapId = mapId;
    this.map = null;
    this.marker = null;
    this.polyline = null;
    this.trackPoints = [];
    
    this.initMap();
  }

  initMap() {
    // Initialisation Map centrée sur la France par défaut
    this.map = L.map(this.mapId).setView([46.603354, 1.888334], 5);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(this.map);

    this.marker = L.marker([46.603354, 1.888334]).addTo(this.map);
    
    // Polyline pour dessiner la trajectoire du tracker (limité à 50 points)
    this.polyline = L.polyline([], {
      color: '#00e5ff', // Cyan fluorescent assorti au thème
      weight: 3,
      opacity: 0.8,
      lineJoin: 'round'
    }).addTo(this.map);
  }

  updatePosition(lat, lon, details) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (!isNaN(latNum) && !isNaN(lonNum) && latNum !== 0 && lonNum !== 0) {
      const newLatLng = new L.LatLng(latNum, lonNum);
      
      // Déplacement du marqueur
      this.marker.setLatLng(newLatLng);
      
      // Déclenchement de la pulsation glow sur l'icône du marqueur Leaflet
      if (this.marker && this.marker._icon) {
        const iconEl = this.marker._icon;
        iconEl.classList.remove('wasp-pulse');
        // Force reflow pour réinitialiser l'animation CSS
        void iconEl.offsetWidth;
        iconEl.classList.add('wasp-pulse');
      }
      
      // Ajout du point à la trajectoire
      this.trackPoints.push(newLatLng);
      const isFirstPoint = this.trackPoints.length === 1;
      
      if (this.trackPoints.length > 50) {
        this.trackPoints.shift(); // Conserver uniquement les 50 derniers points
      }
      
      // Mise à jour du tracé de la ligne sur la carte
      this.polyline.setLatLngs(this.trackPoints);
      
      // Gestion du recentrage intelligent de la carte
      const chkAutoCenter = document.getElementById('chk-auto-center');
      const shouldCenter = !chkAutoCenter || chkAutoCenter.checked;
      
      if (shouldCenter || isFirstPoint) {
        this.map.setView(newLatLng, isFirstPoint ? 15 : this.map.getZoom());
      }
      
      // Mise à jour de l'infobulle popup dynamique
      if (details) {
        const lang = localStorage.getItem('wasp_lang') || 'fr';
        const fixText = details.gpsFix 
          ? (lang === 'en' ? 'Valid Fix' : 'Fix valide') 
          : (lang === 'en' ? 'No Fix' : 'Aucun Fix');
        
        const modeText = details.mode === 1 
          ? (lang === 'en' ? 'Eco 🔋' : 'Éco 🔋') 
          : (lang === 'en' ? 'Flight 🚀' : 'Vol 🚀');
        
        const popupContent = `
          <div style="font-family: 'Outfit', sans-serif; color: #333; line-height: 1.4; padding: 0.2rem;">
            <b style="font-size: 1rem; color: #111;">Tracker WASP: ${details.tracker} (APID: ${details.apid})</b><br>
            <b>Altitude:</b> ${details.alt.toFixed(1)} m<br>
            <b>Vitesse:</b> ${details.spd.toFixed(1)} km/h<br>
            <b>Cap (COG):</b> ${details.cog.toFixed(1)}°<br>
            <b>GPS Fix:</b> ${fixText}<br>
            <b>Mode:</b> ${modeText}<br>
            <b>Heure GPS:</b> ${details.time}
          </div>
        `;
        
        const isFirst = !this.marker.getPopup();
        this.marker.bindPopup(popupContent);
        
        if (isFirst) {
          this.marker.openPopup();
        } else if (this.marker.isPopupOpen()) {
          this.marker.setPopupContent(popupContent);
        }
      }
    }
  }

  clearTrajectory() {
    this.trackPoints = [];
    if (this.polyline) {
      this.polyline.setLatLngs([]);
    }
    if (this.marker) {
      this.marker.setLatLng([46.603354, 1.888334]);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.waspMapInstance = new WaspMap('map');
});
