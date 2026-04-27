// ============================================================
// CASA0025 — Greenland Glacier × Mining Nexus
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

var precomputed = ee.Image('projects/gen-lang-client-0947282053/assets/0025/greenland_glacier_mining_precomputed');
var contextPrecomputed = ee.Image('projects/gen-lang-client-0947282053/assets/0025/greenland_display_context_precomputed');

var drillholes     = ee.FeatureCollection('projects/gen-lang-client-0947282053/assets/0025/drillholes_post2000_gee_upload');
var miningLicences = ee.FeatureCollection('projects/gen-lang-client-0947282053/assets/0025/greenland_mineral_licences_active_industrial_2026-04-21_gee_upload');
var settlements    = ee.FeatureCollection('projects/gen-lang-client-0947282053/assets/0025/settlement_gee_upload');
var cities         = ee.FeatureCollection('projects/gen-lang-client-0947282053/assets/0025/city_gee_upload');
var graticules     = ee.FeatureCollection('projects/gen-lang-client-0947282053/assets/0025/graticules_15');


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

var glacierVis2000 = {min: 1, max: 1, palette: ['#4fc3f7']};
var glacierVis2024 = glacierVis2000;
var retreatVis     = {min: 0, max: 1, palette: ['#ff1744']};
var modelDomainVis = {
  min: 1, max: 1,
  palette: ['#78909c']   // Slate gray
};

var centralIceVis = {
  min: 1, max: 1,
  palette: ['#eceff1']   // Light gray
};

var lstVis = {
  min: -15, max: 15,
  palette: ['#0d47a1','#42a5f5','#e3f2fd',
            '#fff9c4','#ffb74d','#e65100','#b71c1c']
};

var trendVis = {
  min: -0.05, max: 0.1,
  palette: ['#1565c0','#90caf9','#ffffff',
            '#ffcdd2','#e53935','#b71c1c']
};

// Susceptibility palette (new)
var susceptibilityVis = {
  min: 0,
  max: 1,
  palette: [
    '#d1e9ff',
    '#a3d1ff',
    '#75b8ff',
    '#9575cd',
    '#ff8a65',
    '#e53935',
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
var rightMinesLayer = ui.Map.Layer(
  allMines.style({color: '#FFD600', pointSize: 4}),
  {}, 'Mining Sites', false);
var rightSettlementsLayer = ui.Map.Layer(
  allSettlements.style({color: '#FFFFFF', pointSize: 3}),
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
  fontWeight: 'bold', fontSize: '16px', color: '#4fc3f7',
  backgroundColor: 'rgba(0,0,0,0.6)',
  padding: '6px 12px', position: 'top-left'
}));
rightMap.add(ui.Label('~2024', {
  fontWeight: 'bold', fontSize: '16px', color: '#ff8a65',
  backgroundColor: 'rgba(0,0,0,0.6)',
  padding: '6px 12px', position: 'top-right'
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
  fontSize:'20px',
  color:'#2c3e50',
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
  color:'#2c3e50',
  margin:'16px 0 8px 0'
};

var BODY_STYLE = {
  fontSize:'11px',
  color:'#555',
  margin:'0 0 6px 0'
};

var BUTTON_STYLE = {
  stretch:'horizontal',
  margin:'0 0 4px 0',
  fontSize:'11px',
  padding:'3px',
  color:'#1a4a75'
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

var panel = ui.Panel({
  style: {
    width: '340px',
    padding: '18px',
    backgroundColor: 'white'
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


// ---- Model performance from image asset metadata ----
panel.add(divider());
panel.add(
 ui.Label(
   'Model Performance',
   SECTION_STYLE
 )
);

var modelStatsPanel = ui.Panel();
panel.add(modelStatsPanel);
modelStatsPanel.add(ui.Label('Loading model stats…',
  {color: 'gray', fontStyle: 'italic', fontSize: '11px'}));

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
    {fontSize: '12px', fontWeight: 'bold', color: '#2e7d32'}));
  modelStatsPanel.add(ui.Label(
    'Kappa: ' + st.kappa.toFixed(3),
    {fontSize: '11px'}));
  modelStatsPanel.add(ui.Label(
    'Precision: ' + st.precision.toFixed(3) +
    '  |  Recall: ' + st.recall.toFixed(3),
    {fontSize: '11px'}));
  modelStatsPanel.add(ui.Label(
    'F1 score: ' + st.f1.toFixed(3),
    {fontSize: '11px', fontWeight: 'bold'}));
  modelStatsPanel.add(ui.Label(
    'Train: ' + st.nTrain + '  |  Test: ' + st.nTest + ' samples',
    {fontSize: '10px', color: '#999'}));
  modelStatsPanel.add(ui.Label(
    'Precomputed at ' + st.scale + ' m scale',
    {fontSize: '10px', color: '#999'}));
  modelStatsPanel.add(ui.Label(
    'Validation: ' + st.split,
    {fontSize: '10px', color: '#999'}));
  modelStatsPanel.add(ui.Label(
    'Min label patch: ' + st.minPatch + ' Landsat pixels',
    {fontSize: '10px', color: '#999'}));
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
   colors: ['#1565c0'],
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
'#d1e9ff',
'#a3d1ff',
'#9575cd',
'#ff8a65',
'#e53935',
'#b71c1c'
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

// ---- Click-stats section ----
panel.add(divider());
panel.add(
 ui.Label(
   'Location Statistics',
   SECTION_STYLE
 )
);

panel.add(ui.Label('Click on the map to see location details.',
  {fontSize: '11px', color: '#999', fontStyle: 'italic'}));

var clickStatsPanel = ui.Panel();
panel.add(clickStatsPanel);

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
    var domainText = inModelDomain ? 'Modelled peripheral glacier zone' :
                     inContextOnly ? 'Ice-sheet context only' :
                     'Outside model domain';
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
      var rColor = s.susceptibility > 0.7 ? '#b71c1c' :
                   s.susceptibility > 0.4 ? '#ef6c00' : '#2e7d32';
      var rLabel = s.susceptibility > 0.7 ? 'HIGH' :
                   s.susceptibility > 0.4 ? 'MODERATE' : 'LOW';
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

var mapPanel = splitPanel;
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
print('Click on the map for regional statistics.');
print('═══════════════════════════════════════════════');