// ============================================================
// CASA0025 — Greenland Glacier × Mining Nexus
// Interactive Retreat Susceptibility Application
// ============================================================
//
// Run gee_preprocess_export.js first.
// This app loads the exported multi-band Image Asset instead of
// recomputing Landsat composites, distance rasters, and the RF model
// during app startup.
// ============================================================


// ============================================================
// 0. PROJECT ASSETS
// ============================================================

var precomputed = ee.Image('projects/ee-k24081637/assets/0025/greenland_glacier_mining_precomputed');

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

var countries    = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var AOI          = countries.filter(ee.Filter.eq('country_na', 'Greenland'));
var AOI_geom     = AOI.geometry();

var mineCentroids = miningLicences.map(function(f) {
  return ee.Feature(f.geometry().centroid(), {});
});
var allMines = drillholes.merge(mineCentroids);
var allSettlements = settlements.merge(cities);


// ============================================================
// 2. VISUALISATION PARAMETERS
// ============================================================

var glacierVis2000 = {min: 1, max: 1, palette: ['#4fc3f7']};
var glacierVis2024 = {min: 1, max: 1, palette: ['#1565c0']};
var retreatVis     = {min: 0, max: 1, palette: ['#ff1744']};

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

var susceptibilityVis = {
  min: 0, max: 1,
  palette: ['#2e7d32','#66bb6a','#c8e6c9',
            '#fff9c4','#ffcc80','#ef6c00',
            '#e53935','#b71c1c']
};


// ============================================================
// 3. USER INTERFACE
// ============================================================

// ----- 3.1 Two linked maps -----
var leftMap  = ui.Map();
var rightMap = ui.Map();
leftMap.setOptions('SATELLITE');
rightMap.setOptions('SATELLITE');
leftMap.setCenter(-42, 72, 4);
var linker = ui.Map.Linker([leftMap, rightMap]);

// ----- 3.2 LEFT map layers (~2000) -----
leftMap.addLayer(glacier_2000.selfMask(), glacierVis2000,
  'Glacier Extent ~2000', true);
leftMap.addLayer(lstEarly, lstVis,
  'Summer LST ~2000 (°C)', false);
leftMap.addLayer(
  graticules.style({color: '#BDBDBD', width: 1}),
  {}, '15° Graticules', true);

// ----- 3.3 RIGHT map layers (~2024 + analysis) -----
rightMap.addLayer(glacier_2024.selfMask(), glacierVis2024,
  'Glacier Extent ~2024', true);
rightMap.addLayer(lstRecent, lstVis,
  'Summer LST ~2024 (°C)', false);
rightMap.addLayer(retreatOnly, retreatVis,
  'Glacier Retreat (ice lost)', false);
rightMap.addLayer(warmingRate, trendVis,
  'Warming Rate (°C/yr)', false);
rightMap.addLayer(susceptibilityMap, susceptibilityVis,
  'Retreat Susceptibility Prediction', true);
rightMap.addLayer(
  graticules.style({color: '#BDBDBD', width: 1}),
  {}, '15° Graticules', true);

rightMap.addLayer(
  allMines.style({color: '#FFD600', pointSize: 4}),
  {}, 'Mining Sites', true);
rightMap.addLayer(
  allSettlements.style({color: '#FFFFFF', pointSize: 3}),
  {}, 'Settlements', false);

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


// ============================================================
// 4. CONTROL PANEL
// ============================================================

var panel = ui.Panel({
  style: {
    width: '320px',
    padding: '12px',
    position: 'bottom-left',
    backgroundColor: 'white'
  }
});

panel.add(ui.Label('Greenland Glacier–Mining Nexus', {
  fontWeight: 'bold', fontSize: '18px', margin: '0 0 4px 0'
}));
panel.add(ui.Label(
  'Exploring glacier retreat, climate warming, and mining activity ' +
  'across Greenland\'s peripheral glacier zone.',
  {fontSize: '11px', color: '#666', margin: '0 0 10px 0'}
));

panel.add(ui.Label('How to use:', {fontWeight: 'bold', fontSize: '13px'}));
panel.add(ui.Label('• Drag the swipe bar to compare 2000 vs 2024',
  {fontSize: '11px'}));
panel.add(ui.Label('• Toggle layers with the Layers button on each map',
  {fontSize: '11px'}));
panel.add(ui.Label('• Click anywhere on the map for regional stats',
  {fontSize: '11px', margin: '0 0 10px 0'}));

// ---- Model performance from image asset metadata ----
panel.add(ui.Label('— Model Performance —', {
  fontWeight: 'bold', fontSize: '13px', margin: '8px 0 4px 0'
}));

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
panel.add(ui.Label('— Susceptibility Legend —', {
  fontWeight: 'bold', fontSize: '13px', margin: '10px 0 4px 0'
}));

var legendPalette = ['#2e7d32','#66bb6a','#fff9c4',
                     '#ffcc80','#e53935','#b71c1c'];
var legendLabels  = ['Very Low','Low','Moderate',
                     'High','Very High','Critical'];

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

// ---- Click-stats section ----
panel.add(ui.Label('— Click Stats —', {
  fontWeight: 'bold', fontSize: '13px', margin: '10px 0 4px 0'
}));
panel.add(ui.Label('Click on the map to see location details.',
  {fontSize: '11px', color: '#999', fontStyle: 'italic'}));

var clickStatsPanel = ui.Panel();
panel.add(clickStatsPanel);

// ---- Methodology note ----
panel.add(ui.Label('— Methodology —', {
  fontWeight: 'bold', fontSize: '13px', margin: '10px 0 4px 0'
}));
panel.add(ui.Label(
  'Heavy processing is run once in gee_preprocess_export.js and loaded ' +
  'here as a multi-band Image Asset. Glacier extent uses Landsat NDSI ' +
  '(threshold > 0.4). Temperature trend uses Landsat ST via per-pixel ' +
  'linear fit over 2001-2024 summers. Retreat susceptibility is predicted ' +
  'with Random Forest using cleaned retreat/stable labels, spatial block ' +
  'validation, terrain, warming, mining proximity, settlement proximity, ' +
  'and coastal proximity predictors.',
  {fontSize: '10px', color: '#666'}
));
panel.add(ui.Label('CASA0025 Coursework · UCL CASA', {
  fontSize: '9px', color: '#999', margin: '6px 0 0 0'
}));

leftMap.add(panel);


// ============================================================
// 5. CLICK HANDLER
// ============================================================

var markerLayer = null;

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
      scale: clickStatsScale, maxPixels: 1e9}).get('elevation')
  }).evaluate(function(s) {
    clickStatsPanel.clear();

    if (!s || s.area2000 === null) {
      clickStatsPanel.add(ui.Label(
        'No data here — click on land.', {color: 'red', fontSize: '11px'}));
      return;
    }

    clickStatsPanel.add(ui.Label(
      coords.lat.toFixed(3) + '°N, ' +
      Math.abs(coords.lon).toFixed(3) + '°W',
      {fontWeight: 'bold', fontSize: '13px'}));
    clickStatsPanel.add(ui.Label(
      '(25 km radius)',
      {fontSize: '10px', color: 'gray', margin: '0 0 4px 0'}));

    var a0  = (s.area2000 / 1e6).toFixed(1);
    var a1  = (s.area2024 / 1e6).toFixed(1);
    var dA  = (a1 - a0).toFixed(1);
    var pct = a0 > 0 ? ((dA / a0) * 100).toFixed(1) : 'N/A';

    clickStatsPanel.add(ui.Label('Glacier', {
      fontWeight: 'bold', fontSize: '12px', margin: '6px 0 2px 0'}));
    clickStatsPanel.add(ui.Label(
      '~2000: ' + a0 + ' km²   ~2024: ' + a1 + ' km²',
      {fontSize: '11px'}));
    clickStatsPanel.add(ui.Label(
      'Change: ' + (dA > 0 ? '+' : '') + dA + ' km² (' +
      (pct > 0 ? '+' : '') + pct + '%)',
      {fontSize: '11px', fontWeight: 'bold',
       color: dA < 0 ? 'red' : '#2e7d32'}));

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
        {fontSize: '14px', fontWeight: 'bold', color: rColor}));
    } else {
      clickStatsPanel.add(ui.Label('No current glacier at this location.',
        {fontSize: '11px', color: '#999', margin: '6px 0 0 0'}));
    }

    var marker = ui.Map.Layer(
      ee.FeatureCollection([ee.Feature(region)]),
      {color: 'yellow'}, 'Selected Region');
    if (markerLayer !== null) {
      rightMap.layers().remove(markerLayer);
    }
    rightMap.layers().add(marker);
    markerLayer = marker;
  });
}

rightMap.onClick(handleMapClick);
leftMap.onClick(handleMapClick);


// ============================================================
// 6. ASSEMBLE APP
// ============================================================

ui.root.clear();
ui.root.add(splitPanel);

print('');
print('═══════════════════════════════════════════════');
print('  Greenland Glacier–Mining Nexus Explorer');
print('═══════════════════════════════════════════════');
print('Loaded precomputed asset:', precomputed);
print('Band names:', precomputed.bandNames());
print('Model accuracy:', precomputed.get('accuracy'));
print('Kappa:', precomputed.get('kappa'));
print('F1:', precomputed.get('f1'));
print('Click on the map for regional statistics.');
print('═══════════════════════════════════════════════');
