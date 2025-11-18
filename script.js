// Kebutuhan HTML: sertakan leaflet CSS/JS dan div#map lalu panggil initMap(mode).
// File ini:
//   - Membuat peta Leaflet
//   - Menambahkan layer WMS sesuai mode
//   - Menangani klik peta untuk GetFeatureInfo
//   - Melakukan fit extent WMS selalu saat inisialisasi / ganti mode

// ==============================
// Inisialisasi Peta
// ==============================
var map;
var activeConfig;
var bidangWMSLayer;
var geoJsonLayer; // layer vector hasil WFS untuk zoom exact
var HIGH_ZOOM_THRESHOLD = 18; // ambang zoom untuk pakai vector agar tidak hilang
// Tambahan: pindahkan buildWmsUrl ke global
function buildWmsUrl(base, params){
  var url = base + '?' + new URLSearchParams(params).toString();
  if (window.USE_PROXY && window.PROXY_URL) {
    return window.PROXY_URL + encodeURIComponent(url);
  }
  return url;
}
// Tambahan: fungsi GetFeatureInfo yang sebelumnya hilang
function getFeatureInfoUrl(latlng){
  if(!map || !activeConfig) return null;
  var point = map.latLngToContainerPoint(latlng, map.getZoom());
  var size  = map.getSize();
  var params = {
    // Gunakan EPSG:4326 karena BBOX dari Leaflet masih dalam derajat (lon/lat)
    request:'GetFeatureInfo', service:'WMS', srs:'EPSG:4326', styles:'',
    version:'1.1.1', format:'image/png', transparent:true,
    query_layers: activeConfig.layerName, layers: activeConfig.layerName,
    info_format:'application/json',
    feature_count: 10,
    bbox: map.getBounds().toBBoxString(),
    width: size.x, height: size.y,
    x: Math.round(point.x), y: Math.round(point.y)
  };
  return buildWmsUrl(activeConfig.wmsBase, params);
}
// Auto inisialisasi bila ada parameter mode di URL (dipanggil setelah DOM siap)
document.addEventListener('DOMContentLoaded', () => {
  showPageFadeOverlay();
  var mapDiv = document.getElementById('map');
  if (!mapDiv) {
    hidePageFadeOverlay();
    return;
  }
  const params = new URLSearchParams(location.search);
  const qpMode = params.get('mode');
  if (qpMode) {
    if (typeof initMap === 'function') initMap(qpMode);
  }
  // Sembunyikan overlay setelah peta siap (tunggu sedikit agar tile sempat render)
  setTimeout(hidePageFadeOverlay, 900);
});

// Inisialisasi peta
function initMap(mode){
  // Prevent double initialization of the map
  if (window._leafletMapInstance) {
    return window._leafletMapInstance;
  }

  // Konfigurasi mode dan peta
  const MODE_CONFIG = window.MODE_CONFIG || {};
  activeConfig = MODE_CONFIG[mode] || MODE_CONFIG.kasdesa || Object.values(MODE_CONFIG)[0];
  const center = window.APP_DEFAULT_CENTER || [-6.2,106.8];
  const zoom = window.APP_DEFAULT_ZOOM || 12;

  // Inisialisasi peta
  map = L.map('map').setView(center, zoom);
  var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  var googleLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '© Google Maps',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
  });

  // Layer bidang: gunakan GeoJSON dari WFS, bukan WMS
  geoJsonLayer = null;
  let bidangLayerGroup = L.layerGroup();
  let bidangOpacity = 1.0; // default opacity

  // Fungsi untuk set opacity bidang
  function setBidangOpacity(op) {
    bidangOpacity = op;
    if (geoJsonLayer) {
      geoJsonLayer.setStyle({color:'#ff0000', weight:2, opacity:1, fillOpacity: bidangOpacity});
    }
  }

  // Kembalikan kontrol opacity ke kanan bawah
  function addBidangOpacityControl() {
    if (document.getElementById('bidang-opacity-control')) return;
    const ctrl = document.createElement('div');
    ctrl.id = 'bidang-opacity-control';
    ctrl.style = 'position:absolute;bottom:18px;right:18px;z-index:1001;background:#fff;padding:8px 14px;border-radius:6px;box-shadow:0 2px 8px #0002;font-size:0.97em;font-family:Arial,sans-serif;';
    ctrl.innerHTML = `
      <label>
        Opacity Bidang:
        <input type="range" id="bidang-opacity" min="0" max="1" step="0.05" value="1" style="vertical-align:middle;">
        <span id="bidang-opacity-value">1.00</span>
      </label>
    `;
    document.body.appendChild(ctrl);
    document.getElementById('bidang-opacity').addEventListener('input', function(e){
      setBidangOpacity(Number(e.target.value));
      document.getElementById('bidang-opacity-value').textContent = Number(e.target.value).toFixed(2);
    });
  }

  // Perbaiki: bidangLayerGroup harus ditambahkan ke map sebelum/bersamaan dengan geoJsonLayer
  bidangLayerGroup.addTo(map);

  zoomToGeoJsonFeatures().then(geojson => {
    if (geoJsonLayer) bidangLayerGroup.removeLayer(geoJsonLayer);
    geoJsonLayer = L.geoJSON(geojson, {
      style: function() {
        return {color:'#ff0000', weight:2, opacity:1, fillOpacity: bidangOpacity};
      },
      onEachFeature: function (feature, layer) {
        function bidangClickHandler(e) {
          let props = feature.properties || {};
          let html = `
            <div style="min-width:220px;max-width:350px;">
              <div style="font-weight:bold;font-size:1.1em;margin-bottom:6px;color:#d32f2f;">
                Informasi Bidang
              </div>
              <table style="border-collapse:collapse;width:100%;font-size:0.97em;">
                ${Object.entries(props).map(([k,v]) => {
                  if (/luas/i.test(k) && !isNaN(parseFloat(v))) {
                    let val = Math.round(Number(v));
                    return `<tr>
                      <td style=\"border-bottom:1px solid #eee;padding:4px 6px 4px 0;color:#555;\"><b>${k}</b></td>
                      <td style=\"border-bottom:1px solid #eee;padding:4px 0 4px 6px;color:#222;\">${val} m&sup2;</td>
                    </tr>`;
                  }
                  return `<tr>
                    <td style=\"border-bottom:1px solid #eee;padding:4px 6px 4px 0;color:#555;\"><b>${k}</b></td>
                    <td style=\"border-bottom:1px solid #eee;padding:4px 0 4px 6px;color:#222;\">${v ?? '-'}</td>
                  </tr>`;
                }).join('')}
              </table>
            </div>
          `;
          layer.bindPopup(html).openPopup(e.latlng);
        }
        layer._bidangClickHandler = bidangClickHandler;
        layer.on('click', bidangClickHandler);
      }
    });
    // Fungsi untuk enable/disable klik bidang
    function setBidangClickEnabled(enabled) {
      geoJsonLayer.eachLayer(function(layer) {
        if (layer._bidangClickHandler) {
          // Atur event click
          if (enabled) {
            layer.on('click', layer._bidangClickHandler);
          } else {
            layer.off('click', layer._bidangClickHandler);
          }
        }
        // Atur interaktivitas bidang
        layer.options.interactive = !!enabled;
        layer.setStyle({interactive: !!enabled});
        // Paksa kursor tetap crosshair saat mode ukur aktif
        if (!enabled) {
          if (layer._path) layer._path.style.cursor = 'crosshair';
        } else {
          if (layer._path) layer._path.style.cursor = '';
        }
      });
    }
    window._setBidangClickEnabled = setBidangClickEnabled;
    // Pastikan update klik bidang sesuai mode ukur saat layer selesai di-load
    if (typeof window._isMeasuringMode === 'function') {
      setBidangClickEnabled(!(window._isMeasuringMode && window._isMeasuringMode()));
    }
    bidangLayerGroup.addLayer(geoJsonLayer);
    setBidangOpacity(bidangOpacity);
    addBidangOpacityControl();
  }).catch(err => {
    console.warn('Zoom GeoJSON gagal:', err);
  }).finally(() => {
    setTimeout(hidePageFadeOverlay, 900);
  });

  // Tambahkan overlay Bhumi ATR/BPN (bidang tanah)
  // Sumber tile Bhumi: https://bhumi.atrbpn.go.id/peta (tile format: PNG, EPSG:3857)
  // Contoh URL: https://bhumi.atrbpn.go.id/geoserver/gwc/service/wmts?layer=geoserver:bidang_tanah&style=&tilematrixset=EPSG:3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix=EPSG:3857:{z}&TileCol={x}&TileRow={y}
  var bhumiBidangLayer = L.tileLayer(
    'https://bhumi.atrbpn.go.id/geoserver/gwc/service/wmts?' +
    'layer=geoserver:bidang_tanah&style=&tilematrixset=EPSG:3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png' +
    '&TileMatrix=EPSG:3857:{z}&TileCol={x}&TileRow={y}',
    {
      maxZoom: 20,
      opacity: 0.7,
      attribution: '© ATR/BPN Bhumi'
    }
  );

  // Layer control (hapus 'Bidang Tanah Bhumi')
  L.control.layers({
    'OpenStreetMap': osmLayer,
    'Google Maps': googleLayer
  }, {
    'Bidang': bidangLayerGroup
    // 'Bidang Tanah Bhumi' dihapus
  }).addTo(map);

  // Setelah inisialisasi map, pindahkan kontrol zoom ke kiri atas (topleft)
  map.zoomControl.setPosition('topleft');
  // Geser ke bawah tombol kembali/logout (misal: 70px dari atas)
  setTimeout(() => {
    const zoomCtrl = document.querySelector('.leaflet-control-zoom');
    if (zoomCtrl) {
      zoomCtrl.style.top = '70px';
      zoomCtrl.style.left = '10px';
      zoomCtrl.style.right = 'auto';
      zoomCtrl.style.bottom = 'auto';
    }
  }, 0);

  // Setelah inisialisasi map, tambahkan fitur pengukuran
  addSimpleMeasureTools(map);

  // Store the map instance globally to prevent re-initialization
  window._leafletMapInstance = map;
  return map;
}

// --- Fitur pengukuran sederhana (tanpa plugin eksternal) ---
function addSimpleMeasureTools(map) {
  // Pantau perubahan mode ukur untuk enable/disable klik bidang
  function updateBidangClick() {
    if (window._setBidangClickEnabled) {
      window._setBidangClickEnabled(!(window._isMeasuringMode && window._isMeasuringMode()));
    }
  }

  // Kontrol tombol
  const controlDiv = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
  controlDiv.style.background = '#fff';
  controlDiv.style.padding = '4px 6px';
  controlDiv.style.borderRadius = '6px';
  controlDiv.style.boxShadow = '0 2px 8px #0002';
  controlDiv.style.display = 'flex';
  controlDiv.style.gap = '6px';
  controlDiv.style.fontFamily = 'Arial,sans-serif';

  const btnLine = L.DomUtil.create('button', '', controlDiv);
  btnLine.textContent = 'Ukur Jarak';
  btnLine.style.fontSize = '12px';
  btnLine.style.cursor = 'pointer';
  btnLine.style.border = '1px solid #1976d2';
  btnLine.style.background = '#1976d2';
  btnLine.style.color = '#fff';
  btnLine.style.borderRadius = '4px';
  btnLine.style.padding = '3px 8px';

  const btnArea = L.DomUtil.create('button', '', controlDiv);
  btnArea.textContent = 'Ukur Area';
  btnArea.style.fontSize = '12px';
  btnArea.style.cursor = 'pointer';
  btnArea.style.border = '1px solid #388e3c';
  btnArea.style.background = '#388e3c';
  btnArea.style.color = '#fff';
  btnArea.style.borderRadius = '4px';
  btnArea.style.padding = '3px 8px';

  const btnClear = L.DomUtil.create('button', '', controlDiv);
  btnClear.textContent = 'Hapus Ukur';
  btnClear.style.fontSize = '12px';
  btnClear.style.cursor = 'pointer';
  btnClear.style.border = '1px solid #b71c1c';
  btnClear.style.background = '#b71c1c';
  btnClear.style.color = '#fff';
  btnClear.style.borderRadius = '4px';
  btnClear.style.padding = '3px 8px';

  const customControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () { return controlDiv; }
  });
  map.addControl(new customControl());

  // Layer untuk hasil pengukuran
  const measureLayer = L.layerGroup().addTo(map);

  let measuring = null; // 'line' | 'area' | null
  let points = [];
  let tempLine = null;
  let tempPoly = null;

  // --- Perbaikan: klik pertama pada peta baru mulai menambah titik ---
  let measureActive = false;

  btnLine.onclick = function(e) {
    resetMeasure();
    measuring = 'line';
    measureActive = true;
    map.getContainer().style.cursor = 'crosshair';
    L.DomEvent.stopPropagation(e);
    updateBidangClick();
  };
  btnArea.onclick = function(e) {
    resetMeasure();
    measuring = 'area';
    measureActive = true;
    map.getContainer().style.cursor = 'crosshair';
    L.DomEvent.stopPropagation(e);
    updateBidangClick();
  };
  btnClear.onclick = function(e) {
    resetMeasure();
    measureLayer.clearLayers();
    L.DomEvent.stopPropagation(e);
    updateBidangClick();
  };

  // Ambil semua vertex bidang untuk snap
  let bidangVertices = [];
  function updateBidangVertices() {
    bidangVertices = [];
    if (window.geoJsonLayer) {
      window.geoJsonLayer.eachLayer(function(layer) {
        if (layer.getLatLngs) {
          let latlngs = layer.getLatLngs();
          // latlngs bisa nested (Polygon: [ [ [latlng, ...] ] ]), Polyline: [ [latlng, ...] ]
          function flatten(arr) {
            return Array.isArray(arr) ? arr.reduce((a, b) => a.concat(flatten(b)), []) : [arr];
          }
          bidangVertices = bidangVertices.concat(flatten(latlngs));
        }
      });
    }
  }
  // Update saat geoJsonLayer selesai di-load
  setTimeout(updateBidangVertices, 1200);
  // Juga update jika layer di-clear
  if (window.geoJsonLayer) window.geoJsonLayer.on && window.geoJsonLayer.on('layeradd', updateBidangVertices);

  // Fungsi snap ke vertex terdekat (dalam pixel, misal maxDistPx=10)
  function snapToVertex(latlng, maxDistPx = 10) {
    if (!bidangVertices.length) return latlng;
    let minDist = Infinity, snapped = latlng;
    let mapPoint = map.latLngToContainerPoint(latlng);
    bidangVertices.forEach(v => {
      let vPoint = map.latLngToContainerPoint(v);
      let dist = mapPoint.distanceTo(vPoint);
      if (dist < minDist && dist <= maxDistPx) {
        minDist = dist;
        snapped = v;
      }
    });
    return snapped;
  }
  // Deteksi mode ukur global, agar layer bidang bisa tahu
  window._isMeasuringMode = function() {
    return measuring === 'line' || measuring === 'area';
  };

  map.on('click', function(e) {
    if (!measuring || !measureActive) return;
    // Snap ke vertex bidang terdekat jika ada
    const snappedLatLng = snapToVertex(e.latlng, 10); // 10px toleransi snap
    points.push(snappedLatLng);

    if (measuring === 'line') {
      if (tempLine) map.removeLayer(tempLine);
      tempLine = L.polyline(points, {color:'#1976d2', weight:3}).addTo(map);
      // Tampilkan popup jarak jika ada minimal 2 titik
      if (points.length >= 2) {
        const dist = calcLineDistance(points);
        let popupText = 'Jarak: ' + formatDistance(dist);
        if (points.length >= 3 && points[0].equals(points[points.length-1])) {
          const area = calcPolygonArea(points);
          popupText += '<br>Luas: ' + formatArea(area);
        }
        tempLine.bindPopup(popupText).openPopup(points[points.length-1]);
      }
    }
    if (measuring === 'area') {
      if (tempPoly) map.removeLayer(tempPoly);
      tempPoly = L.polygon(points, {color:'#388e3c', weight:2, fillOpacity:0.1}).addTo(map);
      // Tampilkan popup luas & keliling jika minimal 3 titik
      if (points.length >= 3) {
        const area = calcPolygonArea(points);
        const perimeter = calcLineDistance(points.concat([points[0]]));
        let popupText = 'Luas: ' + formatArea(area) + '<br>Keliling: ' + formatDistance(perimeter);
        tempPoly.bindPopup(popupText).openPopup(points[points.length-1]);
      }
    }
  });

  function resetMeasure() {
    measuring = null;
    measureActive = false;
    points = [];
    if (tempLine) { map.removeLayer(tempLine); tempLine = null; }
    if (tempPoly) { map.removeLayer(tempPoly); tempPoly = null; }
    map.getContainer().style.cursor = '';
    updateBidangClick(); // <-- pastikan update klik bidang setiap selesai/reset ukur
  }

  // Utility
  function formatDistance(m) {
    return m > 1000 ? (m/1000).toFixed(2) + ' km' : m.toFixed(1) + ' m';
  }
  function formatArea(m2) {
    return m2 > 1000000 ? (m2/1000000).toFixed(2) + ' km²' : m2.toFixed(1) + ' m²';
  }
  function calcLineDistance(latlngs) {
    let d = 0;
    for (let i=1; i<latlngs.length; i++) {
      d += latlngs[i-1].distanceTo(latlngs[i]);
    }
    return d;
  }
  // Hitung luas poligon (meter persegi) menggunakan rumus geodesic area
  function calcPolygonArea(latlngs) {
    // Gunakan turf.js untuk hasil geodetik presisi
    if (typeof turf !== 'undefined') {
      // Pastikan poligon tertutup (titik awal = akhir)
      let coords = latlngs.map(ll => [ll.lng, ll.lat]);
      if (coords.length > 2 && (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1])) {
        coords.push(coords[0]);
      }
      const poly = turf.polygon([[...coords]]);
      return turf.area(poly); // hasil dalam meter persegi
    } else {
      // fallback: algoritma lama
      const pts = latlngs.map(ll => [ll.lng * Math.PI/180, ll.lat * Math.PI/180]);
      let area = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        area += (pts[j][0] * Math.sin(pts[i][1]) - pts[i][0] * Math.sin(pts[j][1]));
      }
      area = Math.abs(area * 6378137 * 6378137 / 2.0);
      return area;
    }
  }
}

// Ambil data GeoJSON lewat WFS untuk layer aktif dan zoom
function zoomToGeoJsonFeatures(){
  if(!map || !activeConfig || !activeConfig.wmsBase || !activeConfig.layerName) return Promise.reject('Map/config belum siap');
  // Derive WFS endpoint dari wmsBase
  const wfsBase = activeConfig.wmsBase.replace(/\/wms\b/i,'/wfs');
  const buildWfsUrl = (layerName)=>{
    const params = {
      service:'WFS', version:'1.0.0', request:'GetFeature',
      typeName: layerName,
      outputFormat:'application/json',
      srsName:'EPSG:4326',
      maxFeatures: 5000
    };
    return wfsBase + '?' + new URLSearchParams(params).toString();
  };
  const firstUrl = buildWfsUrl(activeConfig.layerName);
  return fetch(firstUrl)
    .then(r=>{
      if(!r.ok) throw new Error('WFS fetch gagal HTTP '+r.status);
      return r.json();
    })
    .then(geojson=>{
      // Jika kosong, coba resolve nama layer via capabilities
      if(!geojson.features || !geojson.features.length){
        return attemptResolveLayerForWFS().catch(()=>null).then(resolved=>{
          if(resolved){
            const secondUrl = buildWfsUrl(activeConfig.layerName);
            return fetch(secondUrl)
              .then(r2=>{ if(!r2.ok) throw new Error('WFS fetch (resolved) gagal HTTP '+r2.status); return r2.json(); });
          }
          return geojson; // tetap kembalikan yang kosong
        });
      }
      return geojson;
    })
    .then(geojson=>{
      if(!geojson) throw new Error('GeoJSON null');
      if(geoJsonLayer){ map.removeLayer(geoJsonLayer); }
      // Hapus .addTo(map) agar tidak menambah layer langsung ke map
      geoJsonLayer = L.geoJSON(geojson, {style:{color:'#ff0000', weight:2}});
      try {
        const b = geoJsonLayer.getBounds();
        if(b.isValid()) map.fitBounds(b.pad(0.05));
      } catch(e){ console.warn('Gagal menghitung bounds GeoJSON:', e); }
      return geojson;
    });
}
// Coba resolve layerName dari capabilities lalu update activeConfig.layerName bila berhasil
function attemptResolveLayerForWFS(){
  if(!activeConfig || !activeConfig.wmsBase || !activeConfig.layerName) return Promise.reject('Config incomplete');
  const capsUrl = buildWmsUrl(activeConfig.wmsBase, {service:'WMS',request:'GetCapabilities'});
  return fetch(capsUrl)
    .then(r=>r.text())
    .then(txt=>{
      const xml=new DOMParser().parseFromString(txt,'application/xml');
      const original = activeConfig.layerName;
      const resolved = resolveLayerName(xml, original);
      if(resolved && resolved !== original){
        console.warn('LayerName (WFS) corrected:', original,'=>',resolved);
        activeConfig.layerName = resolved;
        return resolved;
      }
      return null;
    })
}

// Extent WMS (auto fit saat init / ganti mode)
function fitWMSExtent(){
  if(!map || !activeConfig) return;
  var capsUrl = buildWmsUrl(activeConfig.wmsBase, {service:'WMS',request:'GetCapabilities'});
  fetch(capsUrl)
    .then(r=>r.text())
    .then(txt=>{
      const xml=new DOMParser().parseFromString(txt,'application/xml');

      // Resolusi nama layer bila ada typo / mismatch
      const originalName = activeConfig.layerName;
      const resolvedName = resolveLayerName(xml, originalName);
      if(resolvedName && resolvedName !== originalName){
        console.warn('Layer name corrected:', originalName, '=>', resolvedName);
        activeConfig.layerName = resolvedName;
        reloadBidangWMSLayer(); // muat ulang layer dengan nama benar
      }

      const layerNode = findLayerNode(xml, activeConfig.layerName);
      if(!layerNode){
        console.warn('Layer tidak ditemukan di GetCapabilities (final):', activeConfig.layerName);
        console.info('Daftar layer tersedia:', listAllLayerNames(xml));
        return;
      }
      // Coba EX_GeographicBoundingBox
      const geoBox = layerNode.getElementsByTagName('EX_GeographicBoundingBox')[0];
      if(geoBox){
        const west = parseFloat(geoBox.getElementsByTagName('westBoundLongitude')[0].textContent);
        const east = parseFloat(geoBox.getElementsByTagName('eastBoundLongitude')[0].textContent);
        const south= parseFloat(geoBox.getElementsByTagName('southBoundLatitude')[0].textContent);
        const north= parseFloat(geoBox.getElementsByTagName('northBoundLatitude')[0].textContent);
        map.fitBounds([[south,west],[north,east]]);
        return;
      }
      // Coba LatLonBoundingBox (WMS 1.1.1 lama)
      const llBox = layerNode.getElementsByTagName('LatLonBoundingBox')[0];
      if(llBox){
        const minx = parseFloat(llBox.getAttribute('minx'));
        const miny = parseFloat(llBox.getAttribute('miny'));
        const maxx = parseFloat(llBox.getAttribute('maxx'));
        const maxy = parseFloat(llBox.getAttribute('maxy'));
        map.fitBounds([[miny,minx],[maxy,maxx]]);
        return;
      }
      // Coba BoundingBox dengan CRS EPSG:4326
      const bBoxes = layerNode.getElementsByTagName('BoundingBox');
      for(const bb of bBoxes){
        const crs = bb.getAttribute('CRS') || bb.getAttribute('SRS');
        if(/EPSG:4326/i.test(crs || '')){
          const minx = parseFloat(bb.getAttribute('minx'));
          const miny = parseFloat(bb.getAttribute('miny'));
          const maxx = parseFloat(bb.getAttribute('maxx'));
          const maxy = parseFloat(bb.getAttribute('maxy'));
          map.fitBounds([[miny,minx],[maxy,maxx]]);
          return;
        }
      }
      console.warn('Tidak ada bounding box cocok untuk layer:', activeConfig.layerName);
    })
    .catch(e=>console.warn('Extent gagal:',e));
}
// Fungsi pencarian node layer lebih fleksibel
function findLayerNode(xml, layerName){
  if(!xml || !layerName) return null;
  const target = layerName.trim();
  const layers = [...xml.getElementsByTagName('Layer')];
  for(const layer of layers){
    const nameEl = layer.getElementsByTagName('Name')[0];
    const titleEl= layer.getElementsByTagName('Title')[0];
    const nameTxt = nameEl ? nameEl.textContent.trim() : '';
    const titleTxt= titleEl ? titleEl.textContent.trim() : '';
    if(nameTxt === target || titleTxt === target) return layer;
  }
  return null;
}
// Retry wrapper agar tetap mencoba beberapa kali
function retryFitWMSExtent(attempt=1, maxAttempt=3){
  try {
    fitWMSExtent();
  } catch(e){
    console.warn('fitWMSExtent error attempt',attempt,e);
  }
  if(attempt < maxAttempt){
    setTimeout(()=>retryFitWMSExtent(attempt+1, maxAttempt), attempt * 300);
  }
}
// Tambahan: fungsi untuk me-reset WMS layer bila nama diperbaiki
function reloadBidangWMSLayer(){
  if(!map || !activeConfig) return;
  showPageFadeOverlay();
  if(bidangWMSLayer) map.removeLayer(bidangWMSLayer);
  bidangWMSLayer = L.tileLayer.wms(activeConfig.wmsBase,{
    layers: activeConfig.layerName,
    format:'image/png',
    transparent:true,
    attribution:'Data ATR/BPN'
  }).addTo(map);
  bidangWMSLayer.once('load', () => setTimeout(hidePageFadeOverlay, 500));
}
// Fuzzy resolve nama layer
function resolveLayerName(xml, desired){
  if(!xml || !desired) return null;
  const desiredTrim = desired.trim();
  const desiredLC = desiredTrim.toLowerCase();
  const names = listAllLayerNames(xml);

  // 1. Exact
  if(names.includes(desiredTrim)) return desiredTrim;

  // 2. Case-insensitive exact
  const ci = names.find(n=>n.toLowerCase()===desiredLC);
  if(ci) return ci;

  // 3. Hilangkan workspace prefix (format workspace:layer)
  if(desiredTrim.includes(':')){
    const justLayer = desiredTrim.split(':').slice(-1)[0];
    const justLayerLC = justLayer.toLowerCase();
    // a. cari layer tanpa workspace exact
    const noWs = names.find(n=>n.split(':').slice(-1)[0] === justLayer);
    if(noWs) return noWs;
    // b. case-insensitive
    const noWsCI = names.find(n=>n.split(':').slice(-1)[0].toLowerCase() === justLayerLC);
    if(noWsCI) return noWsCI;
  }

  // 4. Partial contains (case-insensitive)
  const partial = names.find(n=>n.toLowerCase().includes(desiredLC));
  if(partial) return partial;

  // 5. Levenshtein pendek (jarak <=2)
  const lev = names.find(n=>levenshtein(n.toLowerCase(), desiredLC) <= 2);
  if(lev) return lev;

  return null;
}
// Daftar semua Name di capabilities
function listAllLayerNames(xml){
  return [...xml.getElementsByTagName('Layer')]
    .map(l=>l.getElementsByTagName('Name')[0])
    .filter(Boolean)
    .map(n=>n.textContent.trim())
    .filter(v=>v);
}
// Levenshtein sederhana
function levenshtein(a,b){
  const m=[];
  for(let i=0;i<=b.length;i++){ m[i]=[i]; }
  for(let j=0;j<=a.length;j++){ m[0][j]=j; }
  for(let i=1;i<=b.length;i++){
    for(let j=1;j<=a.length;j++){
      m[i][j] = b[i-1] === a[j-1] ? m[i-1][j-1] : 1+Math.min(m[i-1][j-1], m[i][j-1], m[i-1][j]);
    }
  }
  return m[b.length][a.length];
}
// Fungsi auto zoom setelah login sukses untuk mode kasdesa / dadan
function zoomBidangExtentForMode(mode){
  if(!mode || !['kasdesa','dadan'].includes(mode)) return;
  initMap(mode);
  // Coba zoom langsung ke fitur vector via WFS (GeoJSON)
  zoomToGeoJsonFeatures()
    .catch(err=>{
      console.warn('Zoom GeoJSON gagal, fallback WMS extent:', err);
      if(bidangWMSLayer){ bidangWMSLayer.once('load', ()=>retryFitWMSExtent()); }
      setTimeout(()=>retryFitWMSExtent(), 500); // cadangan
    });
}
// Pastikan saat zoom tinggi tetap tampil vector; bila belum ada, fetch
function ensureVectorOnHighZoom(){
  if(!map) return;
  const z = map.getZoom();
  if(z >= HIGH_ZOOM_THRESHOLD){
    if(!geoJsonLayer){
      zoomToGeoJsonFeatures().catch(e=>console.warn('Gagal fetch vector high zoom:', e));
    }
  }
}
// Listener zoomend
document.addEventListener('DOMContentLoaded', ()=>{
  if(!map){ return; }
  map.on('zoomend', ensureVectorOnHighZoom);
});
// Tambah debug tile error agar tahu bila layer hilang akibat error tile
function attachTileErrorDebug(){
  if(bidangWMSLayer){
    bidangWMSLayer.on('tileerror', e=>{
      console.warn('Tile WMS error:', e.tile.src);
    });
  }
}
// Panggil setelah setiap reload WMS layer
function reloadBidangWMSLayerWithDebug(){
  reloadBidangWMSLayer();
  attachTileErrorDebug();
}
// Listener event loginSuccess (dispatch dari proses login luar)
// Contoh dispatch: document.dispatchEvent(new CustomEvent('loginSuccess',{detail:{mode:'kasdesa'}}));
document.addEventListener('loginSuccess', e=>{
  var mode = e.detail && e.detail.mode;
  zoomBidangExtentForMode(mode);
});
// Ekspos ke global
window.zoomBidangExtentForMode = zoomBidangExtentForMode;

// ========== Tambahan: Overlay Transisi Halus ==========
// Tambahkan CSS transisi dan overlay ke <head>
(function(){
  const style = document.createElement('style');
  style.textContent = `
  .page-fade-overlay {
    position: fixed;
    z-index: 9999;
    inset: 0;
    background: rgba(255,255,255,0.25); /* Ubah dari rgba(30,30,30,0.7) ke lebih terang */
    pointer-events: none;
    opacity: 1;
    transition: opacity 0.6s cubic-bezier(.4,0,.2,1);
  }
  .page-fade-overlay.hide {
    opacity: 0;
    transition: opacity 0.8s cubic-bezier(.4,0,.2,1);
  }
  `;
  document.head.appendChild(style);
})();

// Tambahkan overlay ke body
function addPageFadeOverlay() {
  if (document.getElementById('page-fade-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'page-fade-overlay';
  overlay.id = 'page-fade-overlay';
  document.body.appendChild(overlay);
}
function showPageFadeOverlay() {
  addPageFadeOverlay();
  const overlay = document.getElementById('page-fade-overlay');
  overlay.classList.remove('hide');
}
function hidePageFadeOverlay() {
  const overlay = document.getElementById('page-fade-overlay');
  if (!overlay) return;
  overlay.classList.add('hide');
  setTimeout(() => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }, 900);
}
