// ============================================================
// CASA0025 — Greenland Glacier × Mining Nexus
// Interactive Risk Assessment Application
// ============================================================
//
// FUNCTION 1: Glacier Extent Swipe Comparison (2000 vs 2024)
//   - Landsat NDSI-based glacier mapping at 30 m
//   - Split panel with draggable swipe bar
//
// FUNCTION 2: Machine Learning Retreat Susceptibility
//   - Random Forest 1000 m / 50-tree mode trained on cleaned glacier retreat patterns
//   - 7 predictors: elevation, slope, LST trend, mean LST,
//     mine proximity, settlement proximity, distance to coast
//   - Continuous susceptibility map (0 = low → 1 = high retreat susceptibility)
//
// Paste this script into: https://code.earthengine.google.com/
// ============================================================


// ████████████████████████████████████████████████████████████████
// ██  GEE Table Assets used by this script                     ██
// ██                                                             ██
// ██  Cloud Assets → dark-caldron-488417-n8                       ██
// ██                                                             ██
// ██  1. drillholes_post2000_gee_upload      (mining drillholes) ██
// ██  2. greenland_mineral_licences_...      (licence polygons)  ██
// ██  3. settlement_gee_upload               (65 settlements)    ██
// ██  4. city_gee_upload                     (18 cities)         ██
// ██  5. graticules_15                       (15° graticules)    ██
// ████████████████████████████████████████████████████████████████

// Project asset paths.
// These paths match the Cloud Assets uploaded under:
// dark-caldron-488417-n8 -> Assets
var USE_OPTIONAL_UPLOADED_ASSETS = true;

var ASSET_PATHS = {
  miningLicences: 'projects/dark-caldron-488417-n8/assets/greenland_mineral_licences_active_industrial_2026-04-21_gee_upload',
  drillholes: 'projects/dark-caldron-488417-n8/assets/drillholes_post2000_gee_upload',
  settlements: 'projects/dark-caldron-488417-n8/assets/settlement_gee_upload',
  cities: 'projects/dark-caldron-488417-n8/assets/city_gee_upload',
  graticules: 'projects/dark-caldron-488417-n8/assets/graticules_15'
};

var miningLicences = ee.FeatureCollection(ASSET_PATHS.miningLicences);
var drillholes = ee.FeatureCollection(
  USE_OPTIONAL_UPLOADED_ASSETS ? ASSET_PATHS.drillholes : []
);
var settlements = ee.FeatureCollection(
  USE_OPTIONAL_UPLOADED_ASSETS ? ASSET_PATHS.settlements : []
);
var cities = ee.FeatureCollection(
  USE_OPTIONAL_UPLOADED_ASSETS ? ASSET_PATHS.cities : []
);
var graticules = ee.FeatureCollection(
  USE_OPTIONAL_UPLOADED_ASSETS ? ASSET_PATHS.graticules : []
);

// 1000 m / 50-tree settings for stable Greenland-wide final demo.
var RUN_SETTINGS = {
  samplePointsPerClass: 1000,
  sampleScale: 1000,
  clickStatsScale: 1500,
  rfTrees: 50,
  tileScale: 8,
  showSusceptibilityOnLoad: true
};


// ============================================================
// 0. STUDY AREA & ELEVATION
// ============================================================

// Greenland boundary from LSIB (also serves as coastline)
var countries    = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var AOI          = countries.filter(ee.Filter.eq('country_na', 'Greenland'));
var AOI_geom     = AOI.geometry();
var greenlandBox = ee.Geometry.Rectangle([-73, 59, -12, 84]);

// ArcticDEM v4 — 2 m mosaic, used for elevation & slope
var elevation = ee.Image('UMN/PGC/ArcticDEM/V4/2m_mosaic')
  .select('elevation')
  .clip(AOI_geom);

var slope = ee.Terrain.slope(elevation);

// Peripheral-glacier mask: below 2 500 m
// The interior ice-sheet plateau is too thick and cold to show
// meaningful pixel-level retreat over 2000–2024, and has zero
// human activity. Focusing on the periphery follows Larocca et al. (2023).
var peripheralMask = elevation.lt(2500);


// ============================================================
// 1. GLACIER EXTENT — Landsat NDSI (30 m)
// ============================================================
// NDSI = (Green − SWIR1) / (Green + SWIR1)
// Threshold > 0.4 → ice / snow  (Dozier, 1989)
// Summer only (Jun–Aug) to minimise seasonal-snow contamination.

// ----- 1.1  Cloud masking (QA_PIXEL bits 3 & 4) -----

function maskL7(image) {
  var qa = image.select('QA_PIXEL');
  return image.updateMask(
    qa.bitwiseAnd(1 << 3).eq(0)
      .and(qa.bitwiseAnd(1 << 4).eq(0)));
}

function maskL8(image) {
  var qa = image.select('QA_PIXEL');
  return image.updateMask(
    qa.bitwiseAnd(1 << 3).eq(0)
      .and(qa.bitwiseAnd(1 << 4).eq(0)));
}

// ----- 1.2  NDSI functions (band names differ between L7 and L8/9) -----

function ndsiL7(img) {
  return img.addBands(
    img.normalizedDifference(['SR_B2', 'SR_B5']).rename('NDSI'));
}

function ndsiL8(img) {
  return img.addBands(
    img.normalizedDifference(['SR_B3', 'SR_B6']).rename('NDSI'));
}

// ----- 1.3  Build glacier-extent binary mask for any year range -----

function getGlacierExtent(startYear, endYear) {
  var t0     = ee.Date.fromYMD(startYear, 1, 1);
  var t1     = ee.Date.fromYMD(endYear, 12, 31);
  var summer = ee.Filter.calendarRange(6, 8, 'month');

  var ndsiComposite;

  if (endYear <= 2012) {
    // Landsat 7 only
    ndsiComposite = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterBounds(greenlandBox).filterDate(t0, t1)
      .filter(summer).map(maskL7).map(ndsiL7)
      .select('NDSI').median();

  } else if (startYear >= 2013) {
    // Landsat 8 + 9
    var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .filterBounds(greenlandBox).filterDate(t0, t1)
      .filter(summer).map(maskL8).map(ndsiL8);
    var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
      .filterBounds(greenlandBox).filterDate(t0, t1)
      .filter(summer).map(maskL8).map(ndsiL8);
    ndsiComposite = l8.merge(l9).select('NDSI').median();

  } else {
    // Cross-era: L7 up to 2012, then L8 from 2013
    var l7x = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterBounds(greenlandBox)
      .filterDate(t0, ee.Date.fromYMD(2012, 12, 31))
      .filter(summer).map(maskL7).map(ndsiL7);
    var l8x = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .filterBounds(greenlandBox)
      .filterDate(ee.Date.fromYMD(2013, 1, 1), t1)
      .filter(summer).map(maskL8).map(ndsiL8);
    ndsiComposite = l7x.select('NDSI')
      .merge(l8x.select('NDSI')).median();
  }

  // Binary mask: 1 = ice, 0 = no ice
  return ndsiComposite.gt(0.4)
    .rename('ice')
    .clip(AOI_geom)
    .unmask(0);            // treat no-data as "not ice"
}

// ----- 1.4  Two snapshots (3-year composites for robustness) -----

var glacier_2000 = getGlacierExtent(1999, 2002);
var glacier_2024 = getGlacierExtent(2022, 2024);

// Change detection
// retreat = 1 → ice lost;  0 → no change;  −1 → new ice (rare)
var retreat     = glacier_2000.subtract(glacier_2024).rename('retreat');

// Clean the binary retreat label by removing isolated single-pixel noise.
// This reduces false retreat labels caused by clouds, shadows, striping, or
// seasonal snow that survived compositing.
var minPatchPixels = 3;
var retreatCandidate = retreat.gt(0);
var stableCandidate = glacier_2000.eq(1).and(glacier_2024.eq(1));

var cleanRetreat = retreatCandidate.selfMask()
  .connectedPixelCount(8, true)
  .gte(minPatchPixels)
  .unmask(0)
  .toByte()
  .rename('clean_retreat');

var cleanStable = stableCandidate.selfMask()
  .connectedPixelCount(8, true)
  .gte(minPatchPixels)
  .unmask(0)
  .toByte()
  .rename('clean_stable');

var retreatOnly = cleanRetreat.updateMask(cleanRetreat.eq(1)).rename('retreat');


// ============================================================
// 2. TEMPERATURE — Landsat Surface Temperature (30 m)
// ============================================================
// Landsat Collection 2 Level 2 ST product
//   L7 band: ST_B6  |  L8/9 band: ST_B10
//   Scale factor 0.00341802, Offset 149.0 → Kelvin
//   Subtract 273.15 → Celsius

function lstL7(image) {
  return image.select('ST_B6')
    .multiply(0.00341802).add(149.0).subtract(273.15)
    .rename('LST_C')
    .copyProperties(image, ['system:time_start']);
}

function lstL8(image) {
  return image.select('ST_B10')
    .multiply(0.00341802).add(149.0).subtract(273.15)
    .rename('LST_C')
    .copyProperties(image, ['system:time_start']);
}

// ----- 2.1  Annual summer-mean LST, 2001–2024 -----
// Note: L7 has SLC-off striping after May 2003 — gaps fill in
// across multiple summer scenes, but some noise remains in 2003-2012.
// L8 joins from 2013; L9 from late 2021.

// Final mode uses the full Landsat surface-temperature period that overlaps
// the observed glacier-change window.
var years = ee.List.sequence(2001, 2024);

var annualLST = ee.ImageCollection(years.map(function(year) {
  year = ee.Number(year);
  var s = ee.Date.fromYMD(year, 6, 1);
  var e = ee.Date.fromYMD(year, 8, 31);

  var l7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
    .filterBounds(greenlandBox).filterDate(s, e)
    .map(maskL7).map(lstL7);
  var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterBounds(greenlandBox).filterDate(s, e)
    .map(maskL8).map(lstL8);
  var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(greenlandBox).filterDate(s, e)
    .map(maskL8).map(lstL8);

  return l7.merge(l8).merge(l9).mean()
    .set('year', year)
    .set('system:time_start', s.millis());
}));

// ----- 2.2  Per-pixel linear trend (°C yr⁻¹) -----
var withTime = annualLST.map(function(img) {
  var yr = ee.Number(img.get('year'));
  return img.addBands(ee.Image.constant(yr).float().rename('time'));
});

// linearFit: y = offset + scale × time
// 'scale' band = warming rate (°C yr⁻¹)
var lstTrend    = withTime.select(['time', 'LST_C'])
  .reduce(ee.Reducer.linearFit()).clip(AOI_geom);
var warmingRate = lstTrend.select('scale').rename('warming_rate');

// ----- 2.3  Early vs recent snapshots (for swipe display) -----

var lstEarly = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
  .filterBounds(greenlandBox)
  .filterDate('2000-06-01', '2002-08-31')
  .filter(ee.Filter.calendarRange(6, 8, 'month'))
  .map(maskL7).map(lstL7)
  .mean().clip(AOI_geom).rename('LST_early');

var lstRecent = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterBounds(greenlandBox)
  .filterDate('2022-06-01', '2024-08-31')
  .filter(ee.Filter.calendarRange(6, 8, 'month'))
  .map(maskL8).map(lstL8)
  .merge(
    ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
      .filterBounds(greenlandBox)
      .filterDate('2022-06-01', '2024-08-31')
      .filter(ee.Filter.calendarRange(6, 8, 'month'))
      .map(maskL8).map(lstL8)
  ).mean().clip(AOI_geom).rename('LST_recent');


// ============================================================
// 3. DISTANCE RASTERS
// ============================================================
// cumulativeCost with uniform cost = geodesic distance (m)

function distanceToFC(fc, maxDist) {
  // Buffer features so they are visible when rasterised
  var buffered = fc.map(function(f) { return f.buffer(1000); });
  var source   = ee.Image(0).byte().paint(buffered, 1);
  return ee.Image(1)
    .cumulativeCost(source, maxDist)
    .unmask(maxDist);      // beyond maxDist → set to maxDist
}

// 3a  Distance to nearest mine / drillhole
var mineCentroids = miningLicences.map(function(f) {
  return ee.Feature(f.geometry().centroid(), {});
});
var allMines = drillholes.merge(mineCentroids);

var distToMine = distanceToFC(allMines, 100000)   // 100 km
  .clip(AOI_geom).rename('dist_mine');

var mineProximity = ee.Image(1)
  .subtract(distToMine.divide(100000))
  .max(0).min(1)
  .rename('mine_proximity');

// 3b  Distance to nearest settlement / city
var allSettlements = settlements.merge(cities);

var distToSettlement = distanceToFC(allSettlements, 100000)
  .clip(AOI_geom).rename('dist_settlement');

var settlementProximity = ee.Image(1)
  .subtract(distToSettlement.divide(100000))
  .max(0).min(1)
  .rename('settlement_proximity');

// 3c  Distance to coast
// The outline of the Greenland polygon IS the coastline.
// paint(fc, color, width) with width → paints only the border.
var coastSource = ee.Image(0).byte().paint(AOI, 1, 3);
var distToCoast = ee.Image(1)
  .cumulativeCost(coastSource, 300000)   // 300 km
  .unmask(300000)
  .clip(AOI_geom)
  .rename('dist_coast');


// ============================================================
// 4. RANDOM FOREST MODEL
// ============================================================

// ----- 4.1  Predictor stack (7 bands) -----
// unmask each layer so every sample pixel has valid values

var predictors = elevation.unmask(0).rename('elevation')
  .addBands(slope.unmask(0).rename('slope'))
  .addBands(warmingRate.unmask(0))
  .addBands(lstEarly.unmask(-20).rename('lst_mean'))
  .addBands(mineProximity)
  .addBands(settlementProximity)
  .addBands(distToCoast);

var bandNames = ['elevation', 'slope', 'warming_rate', 'lst_mean',
                 'mine_proximity', 'settlement_proximity', 'dist_coast'];

// ----- 4.2  Target variable -----
// y = 1  glacier retreated (was ice in 2000, gone by 2024)
// y = 0  glacier survived  (was ice in 2000, still ice in 2024)
var target = cleanRetreat.rename('retreat');

// Only sample from cleaned peripheral glacier pixels. This keeps clear
// retreat patches and clear stable-ice patches, while dropping noisy pixels.
var sampleMask = cleanRetreat.eq(1)
  .or(cleanStable.eq(1))
  .and(peripheralMask);

// Spatial fold image for block-based validation. This is stricter than a
// random split because nearby pixels are less likely to appear in both train
// and test sets.
var lonLat = ee.Image.pixelLonLat();
var spatialFold = lonLat.select('longitude').add(180).divide(2).floor()
  .add(lonLat.select('latitude').add(90).divide(2).floor().multiply(13))
  .mod(10)
  .rename('spatial_fold');

var trainingImage = predictors.addBands(target)
  .addBands(spatialFold)
  .updateMask(sampleMask);

// ----- 4.3  Stratified sampling -----
// 2 000 points per class → ~4 000 total
// scale 1000 m balances Greenland-wide coverage against GEE runtime
// If GEE times out, lower samplePointsPerClass or increase sampleScale.

var samples = trainingImage.stratifiedSample({
  numPoints:  RUN_SETTINGS.samplePointsPerClass,
  classBand:  'retreat',
  region:     greenlandBox,
  scale:      RUN_SETTINGS.sampleScale,
  seed:       42,
  geometries: false,
  tileScale:  RUN_SETTINGS.tileScale
});

// Optional diagnostic. Commented out for the live app because it can timeout
// when the whole Greenland training set is evaluated in the Console.
// print('Sample class counts:', samples.aggregate_histogram('retreat'));

// Spatial block split: folds 0-6 for training, folds 7-9 for testing.
// This gives a more conservative accuracy estimate than random pixel splitting.
var trainSet = samples.filter(ee.Filter.lt('spatial_fold', 7));
var testSet  = samples.filter(ee.Filter.gte('spatial_fold', 7));

// ----- 4.4  Train two RF models -----
// (a) classification → confusion matrix & accuracy
// (b) regression     → continuous risk score 0–1

var rfClassify = ee.Classifier.smileRandomForest({
  numberOfTrees: RUN_SETTINGS.rfTrees, seed: 42
}).train({
  features:        trainSet,
  classProperty:   'retreat',
  inputProperties: bandNames
});

var rfPredict = ee.Classifier.smileRandomForest({
  numberOfTrees: RUN_SETTINGS.rfTrees, seed: 42
}).setOutputMode('REGRESSION').train({
  features:        trainSet,
  classProperty:   'retreat',
  inputProperties: bandNames
});

// ----- 4.5  Evaluation -----
var testClassified  = testSet.classify(rfClassify);
var confusionMatrix = testClassified.errorMatrix('retreat', 'classification', [0, 1]);
var cmArray = ee.Array(confusionMatrix.array());
var tn = ee.Number(cmArray.get([0, 0]));
var fp = ee.Number(cmArray.get([0, 1]));
var fn = ee.Number(cmArray.get([1, 0]));
var tp = ee.Number(cmArray.get([1, 1]));
var precision = tp.divide(tp.add(fp).max(1));
var recall = tp.divide(tp.add(fn).max(1));
var f1 = precision.multiply(recall).multiply(2)
  .divide(precision.add(recall).max(0.001));

print('=== MODEL EVALUATION SETUP ===');
print('Accuracy, Kappa, Recall and F1 are defined in the script, but heavy Console evaluation is disabled for the live app to avoid GEE timeouts.');
print('Training samples:',  trainSet.size());
print('Testing samples:',   testSet.size());
// Optional diagnostics. Enable only if running a smaller AOI or sample size.
// print('Confusion Matrix:', confusionMatrix);
// print('Overall Accuracy:', confusionMatrix.accuracy());
// print('Kappa:',            confusionMatrix.kappa());
// print('Precision:',        precision);
// print('Recall:',           recall);
// print('F1 score:',         f1);
// print('Producer Accuracy:', confusionMatrix.producersAccuracy());
// print('Consumer Accuracy:', confusionMatrix.consumersAccuracy());
// print('Train class counts:', trainSet.aggregate_histogram('retreat'));
// print('Test class counts:',  testSet.aggregate_histogram('retreat'));
print('Validation split:',  'Spatial block split: folds 0-6 train, 7-9 test');
print('Minimum label patch:', minPatchPixels, 'connected Landsat pixels');
print('Predictors:', bandNames);

// Variable importance diagnostic.
// A small diagnostic RF is used for chart rendering so the live app does not
// time out while the main susceptibility map still uses RUN_SETTINGS.rfTrees.
var importanceTrainSet = trainSet.randomColumn('importance_random', 7)
  .limit(500, 'importance_random');

var rfImportance = ee.Classifier.smileRandomForest({
  numberOfTrees: 20, seed: 7
}).train({
  features:        importanceTrainSet,
  classProperty:   'retreat',
  inputProperties: bandNames
});

var importance = ee.Dictionary(rfImportance.explain().get('importance'));
print('Variable Importance (diagnostic 20-tree RF):', importance);


// ============================================================
// 5. RISK MAP
// ============================================================
// Predict on pixels that are CURRENTLY glaciated AND peripheral.
// Output: probability-like score (0 = low, 1 = high retreat susceptibility).

var currentGlacierMask = glacier_2024.eq(1).and(peripheralMask);

var riskMap = predictors
  .updateMask(currentGlacierMask)
  .classify(rfPredict)
  .rename('risk')
  .max(0).min(1);          // clip to [0, 1]


// ============================================================
// 6. VISUALISATION PARAMETERS
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

var riskVis = {
  min: 0, max: 1,
  palette: ['#2e7d32','#66bb6a','#c8e6c9',
            '#fff9c4','#ffcc80','#ef6c00',
            '#e53935','#b71c1c']
};


// ============================================================
// 7. USER INTERFACE
// ============================================================

// ----- 7.1  Two linked maps -----
var leftMap  = ui.Map();
var rightMap = ui.Map();
leftMap.setOptions('SATELLITE');
rightMap.setOptions('SATELLITE');
leftMap.setCenter(-42, 72, 4);
var linker = ui.Map.Linker([leftMap, rightMap]);

// ----- 7.2  LEFT map layers (~2000) -----
leftMap.addLayer(glacier_2000.selfMask(), glacierVis2000,
  'Glacier Extent ~2000', true);
leftMap.addLayer(lstEarly, lstVis,
  'Summer LST ~2000 (°C)', false);
leftMap.addLayer(
  graticules.style({color: '#BDBDBD', width: 1}),
  {}, '15° Graticules', true);

// ----- 7.3  RIGHT map layers (~2024 + analysis) -----
rightMap.addLayer(glacier_2024.selfMask(), glacierVis2024,
  'Glacier Extent ~2024', true);
rightMap.addLayer(lstRecent, lstVis,
  'Summer LST ~2024 (°C)', false);
rightMap.addLayer(retreatOnly, retreatVis,
  'Glacier Retreat (ice lost)', false);
rightMap.addLayer(warmingRate, trendVis,
  'Warming Rate (°C/yr)', false);
rightMap.addLayer(riskMap, riskVis,
  'Retreat Susceptibility Prediction',
  RUN_SETTINGS.showSusceptibilityOnLoad);
rightMap.addLayer(
  graticules.style({color: '#BDBDBD', width: 1}),
  {}, '15° Graticules', true);

// Reference layers (styled for visibility)
rightMap.addLayer(
  allMines.style({color: '#FFD600', pointSize: 4}),
  {}, 'Mining Sites', true);
rightMap.addLayer(
  allSettlements.style({color: '#FFFFFF', pointSize: 3}),
  {}, 'Settlements', false);

// ----- 7.4  Map labels -----
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

// ----- 7.5  Split panel (swipe) -----
var splitPanel = ui.SplitPanel({
  firstPanel:  leftMap,
  secondPanel: rightMap,
  wipe: true,
  style: {stretch: 'both'}
});


// ----- 7.6  Control panel -----
var panel = ui.Panel({
  style: {
    width: '320px',
    padding: '12px',
    position: 'bottom-left',
    backgroundColor: 'white'
  }
});

// Title
panel.add(ui.Label('Greenland Glacier–Mining Nexus', {
  fontWeight: 'bold', fontSize: '18px', margin: '0 0 4px 0'
}));
panel.add(ui.Label(
  'Exploring glacier retreat, climate warming, and mining activity ' +
  'across Greenland\'s peripheral glacier zone.',
  {fontSize: '11px', color: '#666', margin: '0 0 10px 0'}
));

// Instructions
panel.add(ui.Label('How to use:', {fontWeight: 'bold', fontSize: '13px'}));
panel.add(ui.Label('• Drag the swipe bar to compare 2000 vs 2024',
  {fontSize: '11px'}));
panel.add(ui.Label('• Toggle layers with the Layers button on each map',
  {fontSize: '11px'}));
panel.add(ui.Label('• Click anywhere on the map for regional stats',
  {fontSize: '11px', margin: '0 0 10px 0'}));

// ---- Model performance (populated asynchronously) ----
panel.add(ui.Label('— Model Performance —', {
  fontWeight: 'bold', fontSize: '13px', margin: '8px 0 4px 0'
}));

var modelStatsPanel = ui.Panel();
panel.add(modelStatsPanel);
modelStatsPanel.add(ui.Label('Loading model stats…',
  {color: 'gray', fontStyle: 'italic', fontSize: '11px'}));

ee.Dictionary({
  accuracy:  confusionMatrix.accuracy(),
  kappa:     confusionMatrix.kappa(),
  precision: precision,
  recall:    recall,
  f1:        f1,
  nTrain:    trainSet.size(),
  nTest:     testSet.size()
}).evaluate(function(st) {
  modelStatsPanel.clear();
  if (!st) {
    modelStatsPanel.add(ui.Label('Could not load stats.', {color: 'red'}));
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
    'Validation: spatial block split',
    {fontSize: '10px', color: '#999'}));
});

// ---- Variable importance chart ----
var importanceFeatures = ee.FeatureCollection(
  bandNames.map(function(name) {
    return ee.Feature(null, {
      variable:   name,
      importance: ee.Number(importance.get(name))
    });
  })
);

var importanceChart = ui.Chart.feature.byFeature(
  importanceFeatures, 'variable', 'importance'
).setChartType('BarChart')
 .setOptions({
   title:  'Variable Importance (diagnostic RF)',
   legend: {position: 'none'},
   hAxis:  {title: 'Importance'},
   vAxis:  {title: ''},
   colors: ['#1565c0'],
   bar:    {groupWidth: '80%'},
   chartArea: {left: 120, width: '55%'}
 });
panel.add(importanceChart);

// ---- Risk legend ----
panel.add(ui.Label('— Risk Legend —', {
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
  'Glacier extent mapped with Landsat NDSI (threshold > 0.4). ' +
  'Temperature trend from Landsat ST (30 m) via per-pixel linear fit ' +
  'over 2001-2024 summers. ' +
  'Retreat susceptibility uses Random Forest ' +
  '(50 trees) trained on cleaned retreat/stable labels and 7 predictors across the ' +
  'peripheral glacier zone (< 2 500 m elevation). Mining drillhole ' +
  'and settlement distances are converted to proximity scores; validation uses ' +
  'a spatial block split to reduce spatial autocorrelation bias.',
  {fontSize: '10px', color: '#666'}
));
panel.add(ui.Label('CASA0025 Coursework · UCL CASA', {
  fontSize: '9px', color: '#999', margin: '6px 0 0 0'
}));

// Add panel to LEFT map (avoids interference with the swipe bar)
leftMap.add(panel);


// ----- 7.7  Click handler (works on both maps) -----

var markerLayer = null;

function handleMapClick(coords) {
  clickStatsPanel.clear();
  clickStatsPanel.add(ui.Label('Computing…',
    {color: 'gray', fontStyle: 'italic', fontSize: '11px'}));

  var point  = ee.Geometry.Point([coords.lon, coords.lat]);
  var region = point.buffer(25000);   // 25 km radius
  var pxArea = ee.Image.pixelArea();

  ee.Dictionary({
    area2000: glacier_2000.multiply(pxArea).reduceRegion({
      reducer: ee.Reducer.sum(), geometry: region,
      scale: RUN_SETTINGS.clickStatsScale,
      maxPixels: 1e9,
      tileScale: RUN_SETTINGS.tileScale}).get('ice'),
    area2024: glacier_2024.multiply(pxArea).reduceRegion({
      reducer: ee.Reducer.sum(), geometry: region,
      scale: RUN_SETTINGS.clickStatsScale,
      maxPixels: 1e9,
      tileScale: RUN_SETTINGS.tileScale}).get('ice'),
    warming: warmingRate.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: region,
      scale: RUN_SETTINGS.clickStatsScale,
      maxPixels: 1e9,
      tileScale: RUN_SETTINGS.tileScale}).get('warming_rate'),
    lstE: lstEarly.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: region,
      scale: RUN_SETTINGS.clickStatsScale,
      maxPixels: 1e9,
      tileScale: RUN_SETTINGS.tileScale}).get('LST_early'),
    lstR: lstRecent.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: region,
      scale: RUN_SETTINGS.clickStatsScale,
      maxPixels: 1e9,
      tileScale: RUN_SETTINGS.tileScale}).get('LST_recent'),
    risk: riskMap.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: region,
      scale: RUN_SETTINGS.clickStatsScale,
      maxPixels: 1e9,
      tileScale: RUN_SETTINGS.tileScale}).get('risk'),
    elev: elevation.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: region,
      scale: RUN_SETTINGS.clickStatsScale,
      maxPixels: 1e9,
      tileScale: RUN_SETTINGS.tileScale}).get('elevation')
  }).evaluate(function(s) {
    clickStatsPanel.clear();

    if (!s || s.area2000 === null) {
      clickStatsPanel.add(ui.Label(
        'No data here — click on land.', {color: 'red', fontSize: '11px'}));
      return;
    }

    // ---- Location ----
    clickStatsPanel.add(ui.Label(
      coords.lat.toFixed(3) + '°N, ' +
      Math.abs(coords.lon).toFixed(3) + '°W',
      {fontWeight: 'bold', fontSize: '13px'}));
    clickStatsPanel.add(ui.Label(
      '(25 km radius)',
      {fontSize: '10px', color: 'gray', margin: '0 0 4px 0'}));

    // ---- Glacier area ----
    var a0  = (s.area2000 / 1e6).toFixed(1);
    var a1  = (s.area2024 / 1e6).toFixed(1);
    var dA  = (a1 - a0).toFixed(1);
    var pct = a0 > 0 ? ((dA / a0) * 100).toFixed(1) : 'N/A';

    clickStatsPanel.add(ui.Label('Glacier', {
      fontWeight: 'bold', fontSize: '12px', margin: '6px 0 2px 0'}));
    clickStatsPanel.add(ui.Label(
      '~2000: ' + a0 + ' km²   ~2024: ' + a1 + ' km²',
      {fontSize: '11px'}));
    var cColor = dA < 0 ? 'red' : '#2e7d32';
    clickStatsPanel.add(ui.Label(
      'Change: ' + (dA > 0 ? '+' : '') + dA + ' km² (' +
      (pct > 0 ? '+' : '') + pct + '%)',
      {fontSize: '11px', fontWeight: 'bold', color: cColor}));

    // ---- Temperature ----
    if (s.lstE !== null && s.lstR !== null) {
      clickStatsPanel.add(ui.Label('Temperature', {
        fontWeight: 'bold', fontSize: '12px', margin: '6px 0 2px 0'}));
      clickStatsPanel.add(ui.Label(
        '~2000: ' + s.lstE.toFixed(1) + '°C   ~2024: ' +
        s.lstR.toFixed(1) + '°C',
        {fontSize: '11px'}));
    }
    if (s.warming !== null) {
      var wD    = (s.warming * 10).toFixed(2);
      var wSign = s.warming > 0 ? '+' : '';
      clickStatsPanel.add(ui.Label(
        'Trend: ' + wSign + wD + ' °C / decade',
        {fontSize: '11px', fontWeight: 'bold',
         color: s.warming > 0 ? '#e65100' : '#1565c0'}));
    }

    // ---- Elevation ----
    if (s.elev !== null) {
      clickStatsPanel.add(ui.Label('Elevation', {
        fontWeight: 'bold', fontSize: '12px', margin: '6px 0 2px 0'}));
      clickStatsPanel.add(ui.Label(
        'Mean: ' + s.elev.toFixed(0) + ' m',
        {fontSize: '11px'}));
    }

    // ---- Risk ----
    if (s.risk !== null) {
      var rPct   = (s.risk * 100).toFixed(0);
      var rColor = s.risk > 0.7 ? '#b71c1c' :
                   s.risk > 0.4 ? '#ef6c00' : '#2e7d32';
      var rLabel = s.risk > 0.7 ? 'HIGH' :
                   s.risk > 0.4 ? 'MODERATE' : 'LOW';
      clickStatsPanel.add(ui.Label('Retreat Susceptibility', {
        fontWeight: 'bold', fontSize: '12px', margin: '6px 0 2px 0'}));
      clickStatsPanel.add(ui.Label(
        rLabel + '  (' + rPct + '%)',
        {fontSize: '14px', fontWeight: 'bold', color: rColor}));
    } else {
      clickStatsPanel.add(ui.Label('No glacier at this location.',
        {fontSize: '11px', color: '#999', margin: '6px 0 0 0'}));
    }

    // ---- Marker on map ----
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
// 8. ASSEMBLE THE APP
// ============================================================

ui.root.clear();
ui.root.add(splitPanel);


// ============================================================
// 9. CONSOLE SUMMARY
// ============================================================

print('');
print('═══════════════════════════════════════════════');
print('  Greenland Glacier–Mining Nexus Explorer');
print('═══════════════════════════════════════════════');
print('');
print('FUNCTION 1 — Glacier Swipe Comparison');
print('  Left:   glacier extent ~2000 (Landsat 7 NDSI, 1999–2002)');
print('  Right:  glacier extent ~2024 (Landsat 8/9 NDSI, 2022–2024)');
print('  Toggle: retreat layer (red = ice lost)');
print('');
print('FUNCTION 2 — Random Forest Retreat Susceptibility');
print('  Predictors: elevation, slope, warming rate, mean LST,');
print('    dist. to mine, dist. to settlement, dist. to coast');
print('  Susceptibility map: green (low) → red (high retreat susceptibility)');
print('');
print('Click on the map for regional statistics.');
print('═══════════════════════════════════════════════');
