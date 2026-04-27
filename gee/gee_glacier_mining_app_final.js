// ============================================================
// CASA0025 — Greenland Glacier Retreat Susceptibility Application
// Interactive Retreat Susceptibility Application
// ============================================================
//
// Run gee_preprocess_export.js first, then gee_context_export.js.
// This app loads exported Image Assets instead of recomputing Landsat
// composites, distance rasters, RF outputs, and display masks during startup.
// ============================================================


// ============================================================
// 0. PROJECT ASSETS
// ============================================================

var precomputed = ee.Image('projects/ee-k24081637/assets/0025/greenland_glacier_mining_precomputed');
var contextPrecomputed = ee.Image('projects/ee-k24081637/assets/0025/greenland_display_context_precomputed');

var drillholes     = ee.FeatureCollection('projects/ee-k24081637/assets/0025/drillholes_post2000_gee_upload');
var miningLicences = ee.FeatureCollection('projects/ee-k24081637/assets/0025/greenland_mineral_licences_active_industrial_2026-04-21_gee_upload');
var settlements    = ee.FeatureCollection('projects/ee-k24081637/assets/0025/settlement_gee_upload');
var cities         = ee.FeatureCollection('projects/ee-k24081637/assets/0025/city_gee_upload');
var graticules     = ee.FeatureCollection('projects/ee-k24081637/assets/0025/graticules_15');


// ============================================================
// 1. PRECOMPUTED BANDS
// ============================================================

var glacier_2000 = precomputed.select('glacier_2000');
var glacier_2024 = precomputed.select('glacier_2024');
var retreatOnly  = precomputed.select('retreat').selfMask();
var warmingRate  = precomputed.select('warming_rate');
var lstEarly     = precomputed.select('lst_early');
var lstRecent    = precomputed.select('lst_recent');
var susceptibilityMap = precomputed.select('susceptibility');
var elevation    = precomputed.select('elevation');
var clickStatsScale = 300;
// Coarser scale for app-startup dashboard summaries.
// Keeps the dashboard responsive; detailed click statistics still use clickStatsScale.
var dashboardStatsScale = 5000;

var countries    = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var AOI          = countries.filter(ee.Filter.eq('country_na', 'Greenland'));
var AOI_geom     = AOI.geometry();

var modelDomain = contextPrecomputed.select('model_domain').selfMask();
var centralIceContext = contextPrecomputed
  .select('ice_sheet_context')
  .selfMask();

var mineCentroids = miningLicences.map(function(f) {
  return ee.Feature(f.geometry().centroid(), {});
});
var allMines = drillholes.merge(mineCentroids);
var allSettlements = settlements.merge(cities);


// ============================================================
// 2. VISUALISATION PARAMETERS
// ============================================================

// Presentation-ready display colours.
// The underlying precomputed assets and model outputs are unchanged.
var glacierVis2000 = {min: 1, max: 1, palette: ['#9dd2f2']};
var glacierVis2024 = {min: 1, max: 1, palette: ['#7cc7ee']};
var retreatVis     = {min: 0, max: 1, palette: ['#e85d75']};
var modelDomainVis = {
  min: 1, max: 1,
  palette: ['#78909c']   // Slate grey model domain
};

var centralIceVis = {
  min: 1, max: 1,
  palette: ['#eceff1']   // Light grey ice-sheet context
};

var lstVis = {
  min: -15, max: 15,
  palette: ['#0b3d91','#4ea3e6','#dcefff',
            '#fff2b2','#ffb36b','#f26c4f','#b71c1c']
};

var trendVis = {
  min: -0.05, max: 0.1,
  palette: ['#2166ac','#92c5de','#f7f7f7',
            '#fddbc7','#ef8a62','#b2182b']
};

// Low risk = green, then yellow / orange / red for higher susceptibility.
var susceptibilityVis = {
  min: 0,
  max: 1,
  palette: [
    '#d8f3dc',
    '#b7e4c7',
    '#fff3b0',
    '#ffc078',
    '#f77f00',
    '#d62828',
    '#b71c1c'
  ]
};


// ============================================================
// 3. USER INTERFACE
// ============================================================

// ----- 3.1 Two linked maps -----
var leftMap  = ui.Map();
var rightMap = ui.Map();
// Minimal gray basemap
var grayStyle = [
  {stylers:[
      {saturation:-100},
      {lightness:40}
  ]},
  {
    elementType:'labels.text.fill',
    stylers:[{color:'#757575'}]
  },
  {
    featureType:'water',
    elementType:'geometry',
    stylers:[{color:'#cbdce6'}]
  }
];

leftMap.setOptions('Basemap', {
  Basemap: grayStyle
});

rightMap.setOptions('Basemap', {
  Basemap: grayStyle
});

leftMap.setControlVisibility({
  mapTypeControl:false
});

rightMap.setControlVisibility({
  mapTypeControl:false
});

leftMap.setCenter(-42, 72, 4);
var linker = ui.Map.Linker([leftMap, rightMap]);

// ----- 3.2 LEFT map layers (~2000) -----
var leftCentralLayer = ui.Map.Layer(
  centralIceContext, centralIceVis,
  'Central/Northern Ice Sheet Context', false, 0.4);
var leftModelDomainLayer = ui.Map.Layer(
  modelDomain, modelDomainVis,
  'Modelled Peripheral Glacier Zone', false, 0.12);
var leftGlacierLayer = ui.Map.Layer(
  glacier_2000.selfMask(), glacierVis2000,
  '2000 Glacier Content', true);
var leftLstLayer = ui.Map.Layer(
  lstEarly, lstVis,
  'Summer LST ~2000 (°C)', false);
var leftGraticulesLayer = ui.Map.Layer(
  graticules.style({color: '#BDBDBD', width: 1}),
  {}, '15° Graticules', true);

leftMap.layers().add(leftCentralLayer);
leftMap.layers().add(leftModelDomainLayer);
leftMap.layers().add(leftGlacierLayer);
leftMap.layers().add(leftLstLayer);
leftMap.layers().add(leftGraticulesLayer);

// ----- 3.3 RIGHT map layers (~2024 + analysis) -----
var rightCentralLayer = ui.Map.Layer(
  centralIceContext, centralIceVis,
  'Central/Northern Ice Sheet Context', false, 0.4);
var rightModelDomainLayer = ui.Map.Layer(
  modelDomain, modelDomainVis,
  'Modelled Peripheral Glacier Zone', false, 1.0);
var rightGlacierLayer = ui.Map.Layer(
  glacier_2024.selfMask(), glacierVis2024,
  '2024 Glacier Content', true);
var rightLstLayer = ui.Map.Layer(
  lstRecent, lstVis,
  'Summer LST ~2024 (°C)', false);
var rightRetreatLayer = ui.Map.Layer(
  retreatOnly, retreatVis,
  'Glacier Retreat (ice lost)', false);
var rightWarmingLayer = ui.Map.Layer(
  warmingRate, trendVis,
  'Warming Rate (°C/yr)', false);
var rightSusceptibilityLayer = ui.Map.Layer(
  susceptibilityMap, susceptibilityVis,
  'Retreat Susceptibility Prediction', false);
var rightGraticulesLayer = ui.Map.Layer(
  graticules.style({color: '#BDBDBD', width: 1}),
  {}, '15° Graticules', true);
// Mining points are styled with partial transparency so they remain visible
// without dominating the glacier and risk layers.
var rightMinesLayer = ui.Map.Layer(
  allMines.style({
    color: '#006d77AA',
    fillColor: '#94d2bd66',
    pointSize: 5,
    pointShape: 'circle',
    width: 1.2
  }),
  {}, 'Mining Sites', false);
var rightSettlementsLayer = ui.Map.Layer(
  allSettlements.style({
    color: '#4a5568',
    fillColor: '#ffffff',
    pointSize: 4,
    pointShape: 'circle',
    width: 1.2
  }),
  {}, 'Settlements', false);

rightMap.layers().add(rightCentralLayer);
rightMap.layers().add(rightModelDomainLayer);
rightMap.layers().add(rightGlacierLayer);
rightMap.layers().add(rightLstLayer);
rightMap.layers().add(rightRetreatLayer);
rightMap.layers().add(rightWarmingLayer);
rightMap.layers().add(rightSusceptibilityLayer);
rightMap.layers().add(rightGraticulesLayer);
rightMap.layers().add(rightMinesLayer);
rightMap.layers().add(rightSettlementsLayer);



// ----- 3.4 Map labels -----
leftMap.add(ui.Label('~2000', {
  fontWeight: 'bold',
  fontSize: '18px',
  color: '#ffffff',
  backgroundColor: '#0b4f8a',
  padding: '7px 14px',
  position: 'top-left'
}));
rightMap.add(ui.Label('~2024', {
  fontWeight: 'bold',
  fontSize: '18px',
  color: '#ffffff',
  backgroundColor: '#f26c4f',
  padding: '7px 14px',
  position: 'top-right'
}));

// ----- 3.5 Split panel -----
var splitPanel = ui.SplitPanel({
  firstPanel:  leftMap,
  secondPanel: rightMap,
  wipe: true,
  style: {stretch: 'both'}
});

var mapPanel = splitPanel;

var activeViewMode = 'default';

// ----- 3.6 Bottom click-summary card -----
// Reference-style output card shown after clicking on the map.
var bottomStatsPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {
    position: 'bottom-center',
    width: '88%',
    padding: '10px 12px',
    margin: '0 0 10px 0',
    backgroundColor: 'rgba(255,255,255,0.96)',
    border: '1px solid #d5dde5'
  }
});
rightMap.add(bottomStatsPanel);

function addBottomCard(title, value, note, color, backgroundColor, wide, valueFontSize, align) {
  var cardWidth = wide ? '175px' : '140px';

  var card = ui.Panel({
    layout: ui.Panel.Layout.flow('vertical'),
    style: {
      width: cardWidth,
      padding: '5px 6px',
      margin: '0 3px',
      backgroundColor: backgroundColor || 'rgba(255,255,255,0.0)',
      border: '0 solid #ffffff'
    }
  });

  card.add(ui.Label(title, {
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#1a4a75',
    margin: '0 0 5px 0',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0)'
  }));

  card.add(ui.Label(value, {
    fontSize: valueFontSize || '13px',
    fontWeight: 'bold',
    color: color || '#0d47a1',
    margin: '0 0 3px 0',
    textAlign: align || 'center',
    whiteSpace: 'pre',
    backgroundColor: 'rgba(0,0,0,0)'
  }));

  if (note) {
    card.add(ui.Label(note, {
      fontSize: '10px',
      color: '#607d8b',
      margin: '0',
      textAlign: 'center',
      whiteSpace: 'pre',
      backgroundColor: 'rgba(0,0,0,0)'
    }));
  }

  bottomStatsPanel.add(card);
}

function riskStyle(value) {
  if (value === null || value === undefined) {
    return {label: 'NO VALUE', pct: '—', color: '#607d8b', bg: '#f2f5f7'};
  }

  var pct = (value * 100).toFixed(0);

  if (value >= 0.75) {
    return {label: 'CRITICAL', pct: pct + '%', color: '#b71c1c', bg: '#fde2e2'};
  }
  if (value >= 0.55) {
    return {label: 'HIGH', pct: pct + '%', color: '#d35400', bg: '#ffe8cc'};
  }
  if (value >= 0.35) {
    return {label: 'MODERATE', pct: pct + '%', color: '#8a6d00', bg: '#fff3bf'};
  }
  return {label: 'LOW', pct: pct + '%', color: '#2e7d32', bg: '#dff3dc'};
}

function renderBottomIdle() {
  bottomStatsPanel.clear();
  addBottomCard('Selected location', 'Click the map', '25 km analysis radius', '#0d47a1', '#ffffff', true);
  addBottomCard('Map Domain', '—', 'Waiting for location', '#00838f', '#ffffff', false, null, 'left');
  addBottomCard('Glacier Change', '—', '~2000 vs ~2024', '#1a4a75', '#ffffff', true);
  addBottomCard('Temperature', '—', 'LST trend after click', '#1565c0', '#ffffff', true);
  addBottomCard('Elevation', '—', 'Mean elevation', '#1a4a75', '#ffffff', false);
  addBottomCard('Retreat Susceptibility', '—', 'Random Forest output', '#2e7d32', '#dff3dc', true);
}

function renderBottomLoading(coords) {
  bottomStatsPanel.clear();
  addBottomCard(
    'Selected location',
    coords.lat.toFixed(3) + '°N\n' + Math.abs(coords.lon).toFixed(3) + '°W',
    'Computing 25 km statistics…',
    '#0d47a1',
    '#ffffff',
    true
  );
  addBottomCard('Map Domain', 'Loading…', '', '#00838f', '#ffffff', false, null, 'left');
  addBottomCard('Glacier Change', 'Loading…', '', '#1a4a75', '#ffffff', true);
  addBottomCard('Temperature', 'Loading…', '', '#1565c0', '#ffffff', true);
  addBottomCard('Elevation', 'Loading…', '', '#1a4a75', '#ffffff', false);
  addBottomCard('Retreat Susceptibility', 'Loading…', '', '#2e7d32', '#dff3dc', true);
}

function renderBottomNoData(coords) {
  bottomStatsPanel.clear();
  addBottomCard(
    'Selected location',
    coords.lat.toFixed(3) + '°N\n' + Math.abs(coords.lon).toFixed(3) + '°W',
    'No data here — click on land',
    '#c62828',
    '#fff5f5',
    true
  );
}

function updateBottomStatsPanel(st) {
  bottomStatsPanel.clear();

  addBottomCard(
    'Selected location',
    st.coords.lat.toFixed(3) + '°N\n' + Math.abs(st.coords.lon).toFixed(3) + '°W',
    '(25 km analysis radius)',
    '#0d47a1',
    '#ffffff',
    true
  );

  addBottomCard(
    'Map Domain',
    st.domainText,
    '',
    st.domainColor,
    '#ffffff',
    false,
    null,
    'left'
  );

  var changeNum = Number(st.dA);
  var pctText = st.pct === 'N/A' ? 'N/A' : ((Number(st.pct) > 0 ? '+' : '') + st.pct + '%');

  addBottomCard(
    'Glacier Change',
    '~2000: ' + st.a0 + ' km²\n~2024: ' + st.a1 + ' km²',
    'Change: ' + (changeNum > 0 ? '+' : '') + st.dA + ' km² (' + pctText + ')',
    changeNum < 0 ? '#c62828' : '#2e7d32',
    '#ffffff',
    true
  );

  var tempText = 'No temperature value';
  var trendText = '';
  var trendColor = '#1565c0';

  if (st.lstE !== null && st.lstR !== null) {
    tempText = '~2000: ' + st.lstE.toFixed(1) + '°C\n~2024: ' + st.lstR.toFixed(1) + '°C';
  }

  if (st.warming !== null) {
    var wD = (st.warming * 10).toFixed(2);
    trendText = 'Trend: ' + (st.warming > 0 ? '+' : '') + wD + ' °C / decade';
    trendColor = st.warming > 0 ? '#e65100' : '#1565c0';
  }

  addBottomCard(
    'Temperature',
    tempText,
    trendText,
    trendColor,
    '#ffffff',
    true
  );

  addBottomCard(
    'Elevation',
    st.elev !== null ? 'Mean: ' + st.elev.toFixed(0) + ' m' : 'No elevation value',
    '',
    '#1a4a75',
    '#ffffff',
    false
  );

  var r = riskStyle(st.susceptibility);
  addBottomCard(
    'Retreat Susceptibility',
    r.pct + '\n' + r.label,
    '',
    r.color,
    r.bg,
    true,
    '16px',
    'left'
  );
}

renderBottomIdle();


function syncBothMaps(layerName, shown){
  if(layerName === 'model'){
    leftModelDomainLayer.setShown(shown);
    rightModelDomainLayer.setShown(shown);
  }

  if(layerName === 'glacier'){
    leftGlacierLayer.setShown(shown);
    rightGlacierLayer.setShown(shown);
  }

  if(layerName === 'graticules'){
    leftGraticulesLayer.setShown(shown);
    rightGraticulesLayer.setShown(shown);
  }
}

function setMarkerShown(shown) {
  if (markerRegionLayer !== null) {
    markerRegionLayer.setShown(shown);
  }
  if (markerPointLayer !== null) {
    markerPointLayer.setShown(shown);
  }
}



function showGlacierComparisonMode() {

  activeViewMode='comparison';

  leftCentralLayer.setShown(false);
  rightCentralLayer.setShown(false);


  syncBothMaps('glacier', true);


  syncBothMaps('model', true);


  syncBothMaps('graticules', false);

  leftLstLayer.setShown(false);
  rightLstLayer.setShown(false);

  rightRetreatLayer.setShown(false);
  rightWarmingLayer.setShown(false);
  rightSusceptibilityLayer.setShown(false);

  rightMinesLayer.setShown(false);
  rightSettlementsLayer.setShown(false);

  setMarkerShown(false);
  
  if(mapPanel !== splitPanel){
    mainUI.remove(mapPanel);
    mapPanel = splitPanel;
    mainUI.add(mapPanel);}
}

function showFutureRiskMode() {
  activeViewMode = 'future';

  leftCentralLayer.setShown(false);
  leftModelDomainLayer.setShown(false);
  leftGlacierLayer.setShown(false);
  leftLstLayer.setShown(false);
  leftGraticulesLayer.setShown(false);

  rightCentralLayer.setShown(false);
  rightModelDomainLayer.setShown(true);
  rightGlacierLayer.setShown(false);
  rightLstLayer.setShown(false);
  rightRetreatLayer.setShown(false);
  rightWarmingLayer.setShown(false);
  rightSusceptibilityLayer.setShown(true);
  rightGraticulesLayer.setShown(true);
  rightMinesLayer.setShown(true);
  rightSettlementsLayer.setShown(false);
  setMarkerShown(true);
  if(mapPanel !== rightMap){
    mainUI.remove(mapPanel);
    mapPanel = rightMap;
    mainUI.add(mapPanel);
}
}


// ============================================================
// 4. CONTROL PANEL
// ============================================================
// ---------- Sidebar style system ----------
var TITLE_STYLE = {
  fontWeight:'bold',
  fontSize:'21px',
  color:'#0b3d66',
  margin:'0 0 10px 0'
};

var SUBTEXT_STYLE = {
  fontSize:'11px',
  color:'#666',
  margin:'0 0 14px 0',
  whiteSpace:'pre'
};

var SECTION_STYLE = {
  fontWeight:'bold',
  fontSize:'13px',
  color:'#1a4a75',
  margin:'14px 0 6px 0'
};

var BODY_STYLE = {
  fontSize:'11px',
  color:'#555',
  margin:'0 0 6px 0'
};

var BUTTON_STYLE = {
  stretch:'horizontal',
  margin:'0 0 6px 0',
  fontSize:'11px',
  padding:'4px',
  color:'#0b4f8a',
  backgroundColor:'#ffffff',
  border:'1px solid #7aa3c8',
  fontWeight:'bold'
};

var STAT_HEADER = {
 fontWeight:'bold',
 fontSize:'12px',
 color:'#2c3e50',
 margin:'8px 0 2px 0'
};

var STAT_TEXT = {
 fontSize:'11px',
 color:'#546e7a',
 margin:'0 0 2px 0'
};

var STAT_HIGHLIGHT = {
 fontSize:'13px',
 fontWeight:'bold',
 color:'#1565c0',
 margin:'3px 0'
};

var STAT_COORD = {
 fontWeight:'bold',
 fontSize:'14px',
 color:'#0d47a1',
 margin:'0 0 2px 0'
};

function divider(){
  return ui.Panel({
    style:{
      height:'1px',
      backgroundColor:'#e0e0e0',
      margin:'14px 0'
    }
  });
}


// ---------- Dashboard helper components ----------
function formatNumberClient(x, digits) {
  if (x === null || x === undefined || isNaN(x)) {
    return '—';
  }
  return Number(x).toFixed(digits || 0);
}

function formatAreaClient(x) {
  if (x === null || x === undefined || isNaN(x)) {
    return '—';
  }
  var n = Number(x);
  if (Math.abs(n) >= 10000) {
    return Math.round(n).toLocaleString();
  }
  if (Math.abs(n) >= 1000) {
    return n.toFixed(0);
  }
  return n.toFixed(1);
}

function metricCard(value, label, subtitle, color) {
  var card = ui.Panel({
    layout: ui.Panel.Layout.flow('vertical'),
    style: {
      width: '128px',
      padding: '8px 8px',
      margin: '0 4px 6px 0',
      backgroundColor: '#ffffff',
      border: '1px solid #d5dde5'
    }
  });

  card.add(ui.Label(value, {
    fontSize: '19px',
    fontWeight: 'bold',
    color: color || '#0b4f8a',
    margin: '0 0 3px 0'
  }));

  card.add(ui.Label(label, {
    fontSize: '11px',
    color: '#34495e',
    margin: '0 0 2px 0'
  }));

  if (subtitle) {
    card.add(ui.Label(subtitle, {
      fontSize: '10px',
      color: '#607d8b',
      margin: '0'
    }));
  }

  return card;
}

function addMetricPair(parent, leftCard, rightCard) {
  var row = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {
      stretch: 'horizontal',
      margin: '0 0 4px 0',
      padding: '0'
    }
  });
  row.add(leftCard);
  row.add(rightCard);
  parent.add(row);
}

function addMiniBar(parent, label, value, maxValue, color, suffix) {
  var safeMax = Math.max(Number(maxValue || 1), 1);
  var safeVal = Math.max(Number(value || 0), 0);
  var pct = Math.max(2, Math.min(100, safeVal / safeMax * 100));

  var row = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal', margin: '2px 0'}
  });

  row.add(ui.Label(label, {
    width: '72px',
    fontSize: '11px',
    color: '#111',
    margin: '3px 5px 0 0'
  }));

  var barTrack = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {
      width: '132px',
      height: '16px',
      backgroundColor: '#f7f9fb',
      margin: '0 6px 0 0'
    }
  });

  barTrack.add(ui.Label('', {
    width: pct + '%',
    height: '16px',
    backgroundColor: color || '#0b4f8a',
    margin: '0'
  }));

  row.add(barTrack);

  row.add(ui.Label(formatAreaClient(safeVal) + (suffix || ''), {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#111',
    margin: '2px 0 0 0'
  }));

  parent.add(row);
}

function renderDashboardLoading(panelTarget, message) {
  panelTarget.clear();
  panelTarget.add(ui.Label(message || 'Loading dashboard summary…', {
    fontSize: '11px',
    color: '#999',
    fontStyle: 'italic',
    margin: '0 0 8px 0'
  }));
}

function renderDashboardSummary(st) {
  overviewPanel.clear();
  riskDashboardPanel.clear();
  workflowPanel.clear();

  if (!st || st.area2000 === null) {
    overviewPanel.add(ui.Label(
      'Dashboard summary unavailable. Check precomputed assets.',
      {fontSize: '11px', color: '#c62828'}
    ));
    return;
  }

  var area2000 = Number(st.area2000 || 0);
  var area2024 = Number(st.area2024 || 0);
  var retreatArea = Number(st.retreatArea || 0);
  var highArea = Number(st.highArea || 0);
  var criticalArea = Number(st.criticalArea || 0);
  var highCriticalArea = highArea + criticalArea;
  var meanWarmingDecade = st.meanWarming === null ? null : Number(st.meanWarming) * 10;

  addMetricPair(
    overviewPanel,
    metricCard(formatAreaClient(area2000), 'Glacier ~2000', 'km² detected ice', '#0b4f8a'),
    metricCard(formatAreaClient(area2024), 'Glacier ~2024', 'km² current ice', '#3f007d')
  );

  addMetricPair(
    overviewPanel,
    metricCard(formatAreaClient(retreatArea), 'Observed ice loss', 'km² retreat signal', '#d62828'),
    metricCard(formatNumberClient(st.mineCount, 0), 'Mining sites', 'licences + drillholes', '#00a6b8')
  );

  addMetricPair(
    overviewPanel,
    metricCard(meanWarmingDecade === null ? '—' : meanWarmingDecade.toFixed(2), 'Mean warming', '°C / decade', '#e65100'),
    metricCard(formatAreaClient(highCriticalArea), 'High-risk zones', 'km² high + critical', '#d62828')
  );

  var veryLow = Number(st.veryLowArea || 0);
  var low = Number(st.lowArea || 0);
  var moderate = Number(st.moderateArea || 0);
  var high = Number(st.highArea || 0);
  var critical = Number(st.criticalArea || 0);
  var maxTier = Math.max(veryLow, low, moderate, high, critical, 1);
  var totalRisk = veryLow + low + moderate + high + critical;
  var highShare = totalRisk > 0 ? ((high + critical) / totalRisk * 100).toFixed(0) : '0';

  riskDashboardPanel.add(ui.Label('Retreat susceptibility by tier', {
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#111',
    margin: '0 0 6px 0'
  }));

  addMiniBar(riskDashboardPanel, 'Very low', veryLow, maxTier, '#d8f3dc', ' km²');
  addMiniBar(riskDashboardPanel, 'Low', low, maxTier, '#74c69d', ' km²');
  addMiniBar(riskDashboardPanel, 'Moderate', moderate, maxTier, '#ffd60a', ' km²');
  addMiniBar(riskDashboardPanel, 'High', high, maxTier, '#f77f00', ' km²');
  addMiniBar(riskDashboardPanel, 'Critical', critical, maxTier, '#d62828', ' km²');

  riskDashboardPanel.add(ui.Label(
    highShare + '% of modelled current glacier area is classified as high or critical susceptibility.',
    {
      fontSize: '12px',
      color: '#3f007d',
      fontWeight: 'bold',
      margin: '8px 0 0 0',
      backgroundColor: '#ffffff'
    }
  ));

  riskDashboardPanel.add(ui.Label(
    'Dashboard areas are approximate overview values calculated at 5 km scale for faster app loading.',
    {
      fontSize: '10px',
      color: '#90a4ae',
      margin: '5px 0 0 0'
    }
  ));

  workflowPanel.add(ui.Label('Spatial risk screening workflow', {
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#111',
    margin: '0 0 6px 0'
  }));

  var modelArea = Number(st.modelDomainArea || 0);
  var maxFlow = Math.max(modelArea, area2024, highCriticalArea, retreatArea, 1);

  addMiniBar(workflowPanel, 'Model zone', modelArea, maxFlow, '#78909c', ' km²');
  addMiniBar(workflowPanel, 'Current ice', area2024, maxFlow, '#7cc7ee', ' km²');
  addMiniBar(workflowPanel, 'High risk', highCriticalArea, maxFlow, '#f77f00', ' km²');
  addMiniBar(workflowPanel, 'Ice loss', retreatArea, maxFlow, '#d62828', ' km²');

  workflowPanel.add(ui.Label(
    'The dashboard narrows the peripheral glacier domain into current ice, high-susceptibility areas, and observed retreat signals.',
    {
      fontSize: '11px',
      color: '#607d8b',
      margin: '7px 0 0 0'
    }
  ));
}

function loadDashboardSummary() {
  renderDashboardLoading(overviewPanel, 'Loading overview metrics…');
  renderDashboardLoading(riskDashboardPanel, 'Loading susceptibility tiers…');
  renderDashboardLoading(workflowPanel, 'Loading screening workflow…');

  // Important: this dashboard is for quick overview only.
  // Use a coarser scale so the Earth Engine App does not hang at startup.
  // The map layers and click statistics still use the full precomputed rasters.
  var areaKm2 = ee.Image.pixelArea().divide(1e6);

  function areaBand(mask, name) {
    return areaKm2.updateMask(mask).rename(name);
  }

  var areaBands = ee.Image.cat([
    areaBand(glacier_2000.eq(1), 'area2000'),
    areaBand(glacier_2024.eq(1), 'area2024'),
    areaBand(retreatOnly, 'retreatArea'),
    areaBand(modelDomain, 'modelDomainArea'),
    areaBand(susceptibilityMap.lt(0.20), 'veryLowArea'),
    areaBand(susceptibilityMap.gte(0.20).and(susceptibilityMap.lt(0.35)), 'lowArea'),
    areaBand(susceptibilityMap.gte(0.35).and(susceptibilityMap.lt(0.55)), 'moderateArea'),
    areaBand(susceptibilityMap.gte(0.55).and(susceptibilityMap.lt(0.75)), 'highArea'),
    areaBand(susceptibilityMap.gte(0.75), 'criticalArea')
  ]);

  var areaStats = areaBands.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: AOI_geom,
    scale: dashboardStatsScale,
    maxPixels: 1e9,
    bestEffort: true,
    tileScale: 4
  });

  var meanWarming = warmingRate.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: AOI_geom,
    scale: dashboardStatsScale,
    maxPixels: 1e9,
    bestEffort: true,
    tileScale: 4
  }).get('warming_rate');

  ee.Dictionary(areaStats).combine(ee.Dictionary({
    meanWarming: meanWarming,
    mineCount: allMines.size(),
    settlementCount: allSettlements.size(),
    dashboardScale: dashboardStatsScale
  })).evaluate(function(st) {
    if (!st) {
      overviewPanel.clear();
      riskDashboardPanel.clear();
      workflowPanel.clear();
      overviewPanel.add(ui.Label(
        'Dashboard summary could not load. Map layers and click statistics still work.',
        {fontSize: '11px', color: '#c62828'}
      ));
      return;
    }
    renderDashboardSummary(st);
  });
}

var panel = ui.Panel({
  style: {
    width: '340px',
    padding: '16px',
    backgroundColor: 'rgba(255,255,255,0.96)',
    border: '1px solid #d5dde5'
  }
});



panel.add(
 ui.Label(
  'Greenland Glacier Retreat\nSusceptibility Application',
  TITLE_STYLE
 )
);

panel.add(
 ui.Label(
'Exploring glacier retreat, climate warming,\n' +
'and mining activity across Greenland’s\n' +
'peripheral glacier zone.',
SUBTEXT_STYLE
 )
);

panel.add(ui.Button({
 label:'Reset Center (Greenland)',
 onClick:function(){
   leftMap.centerObject(AOI,4);
   rightMap.centerObject(AOI,4);
 },
 style:BUTTON_STYLE
}));

panel.add(ui.Button({
 label:'View: 2000 vs 2024 Glacier Content',
 onClick:showGlacierComparisonMode,
 style:BUTTON_STYLE
}));

panel.add(ui.Button({
 label:'View: Future Risk of Melting',
 onClick:showFutureRiskMode,
 style:BUTTON_STYLE
}));

panel.add(divider());

panel.add(ui.Label('How to use:', SECTION_STYLE));

panel.add(ui.Label(
'• Drag the swipe bar to compare 2000 vs 2024\n' +
'• Toggle layers using the map layer controls\n' +
'• Click anywhere on the map for regional statistics',
{
 fontSize:'11px',
 color:'#555',
 whiteSpace:'pre',
 margin:'0 0 10px 0'
}
));

// ---- Overview dashboard ----
panel.add(divider());
panel.add(ui.Label('Overview', SECTION_STYLE));
var overviewPanel = ui.Panel();
panel.add(overviewPanel);

// ---- AOI dashboard ----
panel.add(divider());
panel.add(ui.Label('AOI Dashboard', SECTION_STYLE));
var riskDashboardPanel = ui.Panel({
  style: {
    padding: '7px',
    backgroundColor: '#f7f9fb',
    border: '1px solid #d5dde5'
  }
});
panel.add(riskDashboardPanel);

// ---- Stage funnel ----
panel.add(divider());
panel.add(ui.Label('Stage Funnel', SECTION_STYLE));
var workflowPanel = ui.Panel({
  style: {
    padding: '7px',
    backgroundColor: '#f7f9fb',
    border: '1px solid #d5dde5'
  }
});
panel.add(workflowPanel);

loadDashboardSummary();


// ---- Model performance from image asset metadata ----
panel.add(divider());
panel.add(
 ui.Label(
   'Model Performance',
   SECTION_STYLE
 )
);

var modelStatsPanel = ui.Panel({
  style: {
    padding: '8px 12px',
    margin: '0 0 8px 0',
    backgroundColor: '#ffffff',
    border: '0 solid rgba(255,255,255,0)'
  }
});
panel.add(modelStatsPanel);
modelStatsPanel.add(ui.Label('Loading model stats…',
  {color: 'gray', fontStyle: 'italic', fontSize: '11px', margin: '0'}));

ee.Dictionary({
  accuracy: precomputed.get('accuracy'),
  kappa: precomputed.get('kappa'),
  precision: precomputed.get('precision'),
  recall: precomputed.get('recall'),
  f1: precomputed.get('f1'),
  nTrain: precomputed.get('n_train'),
  nTest: precomputed.get('n_test'),
  scale: precomputed.get('export_scale_m'),
  split: precomputed.get('validation_split'),
  minPatch: precomputed.get('min_patch_pixels')
}).evaluate(function(st) {
  modelStatsPanel.clear();
  if (!st || st.accuracy === null) {
    modelStatsPanel.add(ui.Label(
      'Stats unavailable. Re-run preprocessing export.',
      {color: 'red', fontSize: '11px'}));
    return;
  }
  modelStatsPanel.add(ui.Label(
    'Accuracy: ' + (st.accuracy * 100).toFixed(1) + '%',
    {fontSize: '12px', fontWeight: 'bold', color: '#2e7d32', margin: '0 0 4px 0'}));
  modelStatsPanel.add(ui.Label(
    'Kappa: ' + st.kappa.toFixed(3),
    {fontSize: '11px', color: '#222222', margin: '0 0 4px 0'}));
  modelStatsPanel.add(ui.Label(
    'Precision: ' + st.precision.toFixed(3) +
    ' | Recall: ' + st.recall.toFixed(3),
    {fontSize: '11px', color: '#222222', margin: '0 0 5px 0'}));
  modelStatsPanel.add(ui.Label(
    'F1 score: ' + st.f1.toFixed(3),
    {fontSize: '11px', fontWeight: 'bold', color: '#222222', margin: '0 0 7px 0'}));
  modelStatsPanel.add(ui.Label(
    'Train: ' + st.nTrain + ' | Test: ' + st.nTest + ' samples',
    {fontSize: '10px', color: '#999999', margin: '0 0 5px 0'}));
  modelStatsPanel.add(ui.Label(
    'Precomputed at ' + st.scale + ' m scale',
    {fontSize: '10px', color: '#999999', margin: '0 0 5px 0'}));
  modelStatsPanel.add(ui.Label(
    'Validation: spatial block split',
    {fontSize: '10px', color: '#999999', margin: '0 0 5px 0'}));
  modelStatsPanel.add(ui.Label(
    'Min label patch: ' + st.minPatch + ' Landsat pixels',
    {fontSize: '10px', color: '#999999', margin: '0'}));
});



// ---- Variable importance chart from image asset metadata ----
var importanceFeatures = ee.FeatureCollection([
  ee.Feature(null, {
    variable: 'elevation',
    importance: ee.Number(precomputed.get('importance_elevation'))
  }),
  ee.Feature(null, {
    variable: 'slope',
    importance: ee.Number(precomputed.get('importance_slope'))
  }),
  ee.Feature(null, {
    variable: 'warming_rate',
    importance: ee.Number(precomputed.get('importance_warming_rate'))
  }),
  ee.Feature(null, {
    variable: 'lst_mean',
    importance: ee.Number(precomputed.get('importance_lst_mean'))
  }),
  ee.Feature(null, {
    variable: 'mine_proximity',
    importance: ee.Number(precomputed.get('importance_mine_proximity'))
  }),
  ee.Feature(null, {
    variable: 'settlement_proximity',
    importance: ee.Number(precomputed.get('importance_settlement_proximity'))
  }),
  ee.Feature(null, {
    variable: 'coast_proximity',
    importance: ee.Number(precomputed.get('importance_coast_proximity'))
  })
]);

var importanceChart = ui.Chart.feature.byFeature(
  importanceFeatures, 'variable', 'importance'
).setChartType('BarChart')
 .setOptions({
   title: 'Variable Importance',
   legend: {position: 'none'},
   hAxis: {title: 'Importance'},
   vAxis: {title: ''},
   colors: ['#0b4f8a'],
   bar: {groupWidth: '80%'},
   chartArea: {left: 110, width: '55%'}
 });
panel.add(importanceChart);

// ---- Susceptibility legend ----
panel.add(divider());
panel.add(
 ui.Label(
   'Susceptibility Scale',
   SECTION_STYLE
 )
);

var legendPalette = [
'#d8f3dc',
'#b7e4c7',
'#fff3b0',
'#ffc078',
'#f77f00',
'#d62828'
];

var legendLabels = [
'Very Low',
'Low',
'Moderate',
'High',
'Very High',
'Critical'
];

for (var i = 0; i < legendPalette.length; i++) {
  var row = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {margin: '1px 0'}
  });
  row.add(ui.Label('', {
    backgroundColor: legendPalette[i],
    padding: '8px 16px',
    margin: '0 8px 0 0',
    border: '1px solid #ccc'
  }));
  row.add(ui.Label(legendLabels[i], {fontSize: '11px', margin: '4px 0'}));
  panel.add(row);
}

// ---- Map domain legend ----
panel.add(divider());
panel.add(
 ui.Label(
   'Map Domain',
   SECTION_STYLE
 )
);

var domainPalette = ['#78909c', '#eceff1'];
var domainLabels  = [
  'Modelled peripheral glacier zone',
  'Central/northern ice context only'
];

for (var j = 0; j < domainPalette.length; j++) {
  var domainRow = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {margin: '1px 0'}
  });
  domainRow.add(ui.Label('', {
    backgroundColor: domainPalette[j],
    padding: '8px 16px',
    margin: '0 8px 0 0',
    border: '1px solid #ccc'
  }));
  domainRow.add(ui.Label(domainLabels[j], {
    fontSize: '11px', margin: '4px 0'
  }));
  panel.add(domainRow);
}

// ---- Map output section ----
panel.add(divider());
panel.add(
 ui.Label(
   'Location Statistics',
   SECTION_STYLE
 )
);

panel.add(ui.Label(
  'Click anywhere on the map to generate the bottom dashboard card.\n' +
  'The sidebar is kept for controls, legends, and methodology notes.',
  {
    fontSize: '11px',
    color: '#666',
    whiteSpace: 'pre',
    margin: '0 0 8px 0'
  }
));

// Invisible buffer used by the existing click handler.
// Visible click results are rendered in the bottom dashboard card.
var clickStatsPanel = ui.Panel();

// ---- Methodology note ----
panel.add(divider());
panel.add(
 ui.Label(
   'Methodology',
   SECTION_STYLE
 )
);
panel.add(ui.Label(
  'Heavy processing is run once in gee_preprocess_export.js, while ' +
  'central/northern ice-sheet context and the peripheral study-zone mask ' +
  'are precomputed separately in gee_context_export.js. Glacier extent uses Landsat NDSI ' +
  '(threshold > 0.4). Temperature trend uses Landsat ST via per-pixel ' +
  'linear fit over 2001-2024 summers. Retreat susceptibility is predicted ' +
  'with Random Forest using cleaned retreat/stable labels, spatial block ' +
  'validation, terrain, warming, mining proximity, settlement proximity, ' +
  'and coastal proximity predictors. The model domain is limited to GIMP ' +
  'land ice below 2500 m elevation; the central/high-elevation Greenland ' +
  'Ice Sheet is shown as context only because its dynamics differ from the ' +
  'peripheral glacier zone.',
  {fontSize: '10px', color: '#666'}
));
panel.add(ui.Label('CASA0025 Coursework · UCL CASA', {
  fontSize: '9px', color: '#999', margin: '6px 0 0 0'
}));



// ============================================================
// 5. CLICK HANDLER
// ============================================================

var markerRegionLayer = null;
var markerPointLayer = null;

function handleMapClick(coords) {
  clickStatsPanel.clear();
  clickStatsPanel.add(ui.Label('Computing…',
    {color: 'gray', fontStyle: 'italic', fontSize: '11px'}));
  renderBottomLoading(coords);

  var point  = ee.Geometry.Point([coords.lon, coords.lat]);
  var region = point.buffer(25000);
  var pxArea = ee.Image.pixelArea();

  ee.Dictionary({
    area2000: glacier_2000.multiply(pxArea).reduceRegion({
      reducer: ee.Reducer.sum(), geometry: region,
      scale: clickStatsScale, maxPixels: 1e9}).get('glacier_2000'),
    area2024: glacier_2024.multiply(pxArea).reduceRegion({
      reducer: ee.Reducer.sum(), geometry: region,
      scale: clickStatsScale, maxPixels: 1e9}).get('glacier_2024'),
    warming: warmingRate.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: region,
      scale: clickStatsScale, maxPixels: 1e9}).get('warming_rate'),
    lstE: lstEarly.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: region,
      scale: clickStatsScale, maxPixels: 1e9}).get('lst_early'),
    lstR: lstRecent.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: region,
      scale: clickStatsScale, maxPixels: 1e9}).get('lst_recent'),
    susceptibility: susceptibilityMap.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: region,
      scale: clickStatsScale, maxPixels: 1e9}).get('susceptibility'),
    elev: elevation.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: region,
      scale: clickStatsScale, maxPixels: 1e9}).get('elevation'),
    domain: modelDomain.unmask(0).reduceRegion({
      reducer: ee.Reducer.max(), geometry: region,
      scale: clickStatsScale, maxPixels: 1e9}).get('model_domain'),
    context: centralIceContext.unmask(0).reduceRegion({
      reducer: ee.Reducer.max(), geometry: region,
      scale: clickStatsScale, maxPixels: 1e9}).get('ice_sheet_context')
  }).evaluate(function(s) {
    clickStatsPanel.clear();

    if (!s || s.area2000 === null) {
      clickStatsPanel.add(ui.Label(
        'No data here — click on land.', {color: 'red', fontSize: '11px'}));
      renderBottomNoData(coords);
      return;
    }

    clickStatsPanel.add(ui.Label(
      coords.lat.toFixed(3)+'°N, '+
      Math.abs(coords.lon).toFixed(3)+'°W',
      STAT_COORD));
      
      
    clickStatsPanel.add(ui.Label(
      '(25 km analysis radius)',
      {fontSize: '10px', color: '#90a4ae', margin: '0 0 8px 0'}));

    var inModelDomain = s.domain !== null && s.domain > 0;
    var inContextOnly = !inModelDomain && s.context !== null && s.context > 0;
    var domainText = inModelDomain ? 'Modelled\nperipheral glacier zone' :
                     inContextOnly ? 'Ice-sheet\ncontext only' :
                     'Outside\nmodel domain';
    var domainColor = inModelDomain ? '#00838f' :
                      inContextOnly ? '#607d8b' : '#999';

    clickStatsPanel.add(ui.Label('Map Domain',STAT_HEADER));

    clickStatsPanel.add(ui.Label(domainText,{fontSize:'11px',fontWeight:'bold',color:domainColor,margin:'0 0 6px 0'}));

    var a0  = (s.area2000 / 1e6).toFixed(1);
    var a1  = (s.area2024 / 1e6).toFixed(1);
    var dA  = (a1 - a0).toFixed(1);
    var pct = a0 > 0 ? ((dA / a0) * 100).toFixed(1) : 'N/A';

    clickStatsPanel.add(ui.Label('Glacier Change', STAT_HEADER));
    clickStatsPanel.add(ui.Label(
      '~2000: ' + a0 + ' km²   ~2024: ' + a1 + ' km²',
      {fontSize: '11px'}));
    clickStatsPanel.add(ui.Label(
      'Change: ' + (dA > 0 ? '+' : '') + dA + ' km² (' +
      (pct > 0 ? '+' : '') + pct + '%)',
      {fontSize: '12px', fontWeight: 'bold',
       color: dA < 0 ? '#c62828':'#2e7d32',margin:'2px 0 6px 0'}));

    if (s.lstE !== null && s.lstR !== null) {
      clickStatsPanel.add(ui.Label('Temperature', {
        fontWeight: 'bold', fontSize: '12px', margin: '6px 0 2px 0'}));
      clickStatsPanel.add(ui.Label(
        '~2000: ' + s.lstE.toFixed(1) + '°C   ~2024: ' +
        s.lstR.toFixed(1) + '°C',
        {fontSize: '11px'}));
    }

    if (s.warming !== null) {
      var wD = (s.warming * 10).toFixed(2);
      clickStatsPanel.add(ui.Label(
        'Trend: ' + (s.warming > 0 ? '+' : '') + wD + ' °C / decade',
        {fontSize: '11px', fontWeight: 'bold',
         color: s.warming > 0 ? '#e65100' : '#1565c0'}));
    }

    if (s.elev !== null) {
      clickStatsPanel.add(ui.Label('Elevation', {
        fontWeight: 'bold', fontSize: '12px', margin: '6px 0 2px 0'}));
      clickStatsPanel.add(ui.Label(
        'Mean: ' + s.elev.toFixed(0) + ' m',
        {fontSize: '11px'}));
    }

    if (s.susceptibility !== null) {
      var rPct   = (s.susceptibility * 100).toFixed(0);
      var rColor = s.susceptibility > 0.75 ? '#b71c1c' :
                   s.susceptibility > 0.55 ? '#d35400' :
                   s.susceptibility > 0.35 ? '#8a6d00' : '#2e7d32';
      var rLabel = s.susceptibility > 0.75 ? 'CRITICAL' :
                   s.susceptibility > 0.55 ? 'HIGH' :
                   s.susceptibility > 0.35 ? 'MODERATE' : 'LOW';
      clickStatsPanel.add(ui.Label('Retreat Susceptibility', {
        fontWeight: 'bold', fontSize: '12px', margin: '6px 0 2px 0'}));
      clickStatsPanel.add(ui.Label(
        rLabel + '  (' + rPct + '%)',
        {fontSize: '14px', fontWeight: 'bold', backgroundColor:'#eef4ff',color:rColor,padding:'6px 10px',margin:'4px 0'}));
    } else {
      clickStatsPanel.add(ui.Label(
        inContextOnly ?
          'Context ice only — susceptibility is not modelled here.' :
          'No current glacier at this location.',
        {fontSize: '11px', color: '#999', margin: '6px 0 0 0'}));
    }

    updateBottomStatsPanel({
      coords: coords,
      domainText: domainText,
      domainColor: domainColor,
      a0: a0,
      a1: a1,
      dA: dA,
      pct: pct,
      lstE: s.lstE,
      lstR: s.lstR,
      warming: s.warming,
      elev: s.elev,
      susceptibility: s.susceptibility
    });

    var regionMarker = ui.Map.Layer(
      ee.FeatureCollection([ee.Feature(region)]).style({
        color: '#ff0000',
        fillColor: '#ff000033',
        width: 2
      }),
      {}, 'Selected 25 km Region');
    var pointMarker = ui.Map.Layer(
      ee.FeatureCollection([ee.Feature(point)]).style({
        color: '#ffffff',
        fillColor: '#ff0000',
        pointSize: 8,
        pointShape: 'circle',
        width: 2
      }),
      {}, 'Selected Point');

    if (markerRegionLayer !== null) {
      rightMap.layers().remove(markerRegionLayer);
    }
    if (markerPointLayer !== null) {
      rightMap.layers().remove(markerPointLayer);
    }
    rightMap.layers().add(regionMarker);
    rightMap.layers().add(pointMarker);
    markerRegionLayer = regionMarker;
    markerPointLayer = pointMarker;
    setMarkerShown(activeViewMode !== 'comparison');
  });
}

rightMap.onClick(handleMapClick);
leftMap.onClick(handleMapClick);


// ============================================================
// 6. ASSEMBLE APP
// ============================================================

ui.root.clear();

var mainUI = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {
    stretch: 'both',
    width: '100%',
    height: '100%'
  }
});

mainUI.add(panel);

mainUI.add(mapPanel);

ui.root.add(mainUI);


leftMap.centerObject(AOI,4);
rightMap.centerObject(AOI,4);

print('');
print('═══════════════════════════════════════════════');
print('Greenland Glacier Retreat Susceptibility Application');
print('═══════════════════════════════════════════════');
print('Loaded precomputed asset:', precomputed);
print('Loaded context asset:', contextPrecomputed);
print('Band names:', precomputed.bandNames());
print('Context band names:', contextPrecomputed.bandNames());
print('Model accuracy:', precomputed.get('accuracy'));
print('Kappa:', precomputed.get('kappa'));
print('F1:', precomputed.get('f1'));
print('Click on the map for bottom-card regional statistics.');
print('UI version: compact dashboard cards + fast 5 km overview reductions + ee-k24081637 asset paths.');
print('═══════════════════════════════════════════════');