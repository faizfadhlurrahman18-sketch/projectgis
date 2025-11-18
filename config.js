'use strict';
window.ACCOUNT_MAP = {
	kasdesa: { kasdesa:'kasdesa123' },
	dadan:   { dadan:'dadan123' }
};
window.MODE_CONFIG = {
	kasdesa: {
		wmsBase: 'http://localhost:8080/geoserver/Bidang/wms',
		layerName: 'Bidang:Tanah Kas Desaa'
	},
	dadan: {
		wmsBase: 'http://localhost:8080/geoserver/Bidang/wms',
		layerName: 'Bidang:Bidangjson'
	}
};
window.APP_DEFAULT_CENTER = [-6.2,106.8];
window.APP_DEFAULT_ZOOM = 12;
window.USE_PROXY = false;
window.PROXY_URL = 'http://localhost:5500/proxy?url=';
