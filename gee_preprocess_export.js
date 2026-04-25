// ============================================================
// CASA0025 — Greenland Glacier × Mining Nexus
// Preprocessing / Export Script
// ============================================================
//
// Run this script in the Earth Engine Code Editor first.
// It computes the expensive raster layers once, then exports them
// as a single multi-band Image Asset for the interactive app.
//
// After the export task finishes, run gee_glacier_mining_app.js.
// ============================================================


// ============================================================
// 0. PROJECT ASSETS
// ============================================================

var drillholes     = ee.FeatureCollection('projects/ee-k24081637/assets/0025/drillholes_post2000_gee_upload');
var miningLicences = ee.FeatureCollection('projects/ee-k24081637/assets/0025/greenland_mineral_licences_active_industrial_2026-04-21_gee_upload');
var settlements    = ee.FeatureCollection('projects/ee-k24081637/assets/0025/settlement_gee_upload');
var cities         = ee.FeatureCollection('projects/ee-k24081637/assets/0025/city_gee_upload');

var outputAsset = 'projects/ee-k24081637/assets/0025/greenland_glacier_mining_precomputed';


// ============================================================
// 1. STUDY AREA & TERRAIN
// ============================================================

var countries    = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var AOI          = countries.filter(ee.Filter.eq('country_na', 'Greenland'));
var AOI_geom     = AOI.geometry();
var greenlandBox = ee.Geometry.Rectangle([-73, 59, -12, 84]);

// Use a 300 m working grid for the exported Greenland-wide model.
// ArcticDEM's native 2 m grid is
// much too detailed for country-scale app-time processing.
var exportCrs   = 'EPSG:3413';
var exportScale = 300;
var minPatchPixels = 3;

var elevation = ee.Image('UMN/PGC/ArcticDEM/V4/2m_mosaic')
  .select('elevation')
  .resample('bilinear')
  .reproject({crs: exportCrs, scale: exportScale})
  .clip(AOI_geom)
  .rename('elevation');

var slope = ee.Terrain.slope(elevation).rename('slope');
var peripheralMask = elevation.lt(2500);


// ============================================================
// 2. GLACIER EXTENT — LANDSAT NDSI
// ============================================================

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

function ndsiL7(img) {
  return img.addBands(
    img.normalizedDifference(['SR_B2', 'SR_B5']).rename('NDSI'));
}

function ndsiL8(img) {
  return img.addBands(
    img.normalizedDifference(['SR_B3', 'SR_B6']).rename('NDSI'));
}

function getGlacierExtent(startYear, endYear) {
  var t0     = ee.Date.fromYMD(startYear, 1, 1);
  var t1     = ee.Date.fromYMD(endYear, 12, 31);
  var summer = ee.Filter.calendarRange(6, 8, 'month');

  var ndsiComposite;

  if (endYear <= 2012) {
    ndsiComposite = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterBounds(greenlandBox).filterDate(t0, t1)
      .filter(summer).map(maskL7).map(ndsiL7)
      .select('NDSI').median();
  } else if (startYear >= 2013) {
    var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .filterBounds(greenlandBox).filterDate(t0, t1)
      .filter(summer).map(maskL8).map(ndsiL8);
    var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
      .filterBounds(greenlandBox).filterDate(t0, t1)
      .filter(summer).map(maskL8).map(ndsiL8);
    ndsiComposite = l8.merge(l9).select('NDSI').median();
  } else {
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

  return ndsiComposite.gt(0.4)
    .rename('ice')
    .clip(AOI_geom)
    .unmask(0);
}

var glacier_2000 = getGlacierExtent(1999, 2002).rename('glacier_2000');
var glacier_2024 = getGlacierExtent(2022, 2024).rename('glacier_2024');
var rawRetreat = glacier_2000.subtract(glacier_2024)
  .max(0)
  .rename('raw_retreat');

// Clean retreat and stable labels by removing isolated single-pixel patches.
// This reduces false labels caused by cloud/shadow remnants, seasonal snow,
// and Landsat 7 SLC-off striping in the historical composite.
var retreatCandidate = rawRetreat.gt(0);
var stableCandidate = glacier_2000.eq(1).and(glacier_2024.eq(1));

var cleanRetreat = retreatCandidate.selfMask()
  .connectedPixelCount(8, true)
  .gte(minPatchPixels)
  .unmask(0)
  .toByte()
  .rename('retreat');

var cleanStable = stableCandidate.selfMask()
  .connectedPixelCount(8, true)
  .gte(minPatchPixels)
  .unmask(0)
  .toByte()
  .rename('stable');


// ============================================================
// 3. TEMPERATURE — LANDSAT SURFACE TEMPERATURE
// ============================================================

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

var withTime = annualLST.map(function(img) {
  var yr = ee.Number(img.get('year'));
  return img.addBands(ee.Image.constant(yr).float().rename('time'));
});

var warmingRate = withTime.select(['time', 'LST_C'])
  .reduce(ee.Reducer.linearFit())
  .select('scale')
  .clip(AOI_geom)
  .rename('warming_rate');

var lstEarly = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
  .filterBounds(greenlandBox)
  .filterDate('2000-06-01', '2002-08-31')
  .filter(ee.Filter.calendarRange(6, 8, 'month'))
  .map(maskL7).map(lstL7)
  .mean().clip(AOI_geom).rename('lst_early');

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
  ).mean().clip(AOI_geom).rename('lst_recent');


// ============================================================
// 4. DISTANCE RASTERS
// ============================================================

function distanceToFC(fc, maxDist) {
  var buffered = fc.map(function(f) { return f.buffer(1000); });
  var source   = ee.Image(0).byte().paint(buffered, 1);
  return ee.Image(1)
    .cumulativeCost(source, maxDist)
    .unmask(maxDist);
}

var mineCentroids = miningLicences.map(function(f) {
  return ee.Feature(f.geometry().centroid(), {});
});
var allMines = drillholes.merge(mineCentroids);
var allSettlements = settlements.merge(cities);

var distToMine = distanceToFC(allMines, 100000)
  .clip(AOI_geom).rename('dist_mine');

var mineProximity = ee.Image(1)
  .subtract(distToMine.divide(100000))
  .max(0).min(1)
  .rename('mine_proximity');

var distToSettlement = distanceToFC(allSettlements, 100000)
  .clip(AOI_geom).rename('dist_settlement');

var settlementProximity = ee.Image(1)
  .subtract(distToSettlement.divide(100000))
  .max(0).min(1)
  .rename('settlement_proximity');

var coastSource = ee.Image(0).byte().paint(AOI, 1, 3);
var distToCoast = ee.Image(1)
  .cumulativeCost(coastSource, 300000)
  .unmask(300000)
  .clip(AOI_geom)
  .rename('dist_coast');

var coastProximity = ee.Image(1)
  .subtract(distToCoast.divide(300000))
  .max(0).min(1)
  .rename('coast_proximity');


// ============================================================
// 5. RANDOM FOREST RETREAT SUSCEPTIBILITY MODEL
// ============================================================

var predictors = elevation.unmask(0)
  .addBands(slope.unmask(0))
  .addBands(warmingRate.unmask(0))
  .addBands(lstEarly.unmask(-20).rename('lst_mean'))
  .addBands(mineProximity)
  .addBands(settlementProximity)
  .addBands(coastProximity);

var bandNames = ['elevation', 'slope', 'warming_rate', 'lst_mean',
                 'mine_proximity', 'settlement_proximity', 'coast_proximity'];

var target = cleanRetreat.rename('retreat');

// Only sample from cleaned retreat and cleaned stable-ice patches. Ambiguous
// pixels are excluded from training so the classifier learns from clearer
// examples of historical retreat and persistence.
var sampleMask = cleanRetreat.eq(1)
  .or(cleanStable.eq(1))
  .and(peripheralMask);

// Spatial block validation is stricter than random pixel splitting because it
// reduces leakage from spatially autocorrelated neighbouring pixels.
var lonLat = ee.Image.pixelLonLat();
var spatialFold = lonLat.select('longitude').add(180).divide(2).floor()
  .add(lonLat.select('latitude').add(90).divide(2).floor().multiply(13))
  .mod(10)
  .rename('spatial_fold');

var trainingImage = predictors.addBands(target)
  .addBands(spatialFold)
  .updateMask(sampleMask);

var samples = trainingImage.stratifiedSample({
  numPoints: 2000,
  classBand: 'retreat',
  region: greenlandBox,
  scale: exportScale,
  seed: 42,
  geometries: false,
  tileScale: 4
});

var trainSet = samples.filter(ee.Filter.lt('spatial_fold', 7));
var testSet  = samples.filter(ee.Filter.gte('spatial_fold', 7));

var rfClassify = ee.Classifier.smileRandomForest({
  numberOfTrees: 100, seed: 42
}).train({
  features: trainSet,
  classProperty: 'retreat',
  inputProperties: bandNames
});

var rfPredict = ee.Classifier.smileRandomForest({
  numberOfTrees: 100, seed: 42
}).setOutputMode('REGRESSION').train({
  features: trainSet,
  classProperty: 'retreat',
  inputProperties: bandNames
});

var testClassified = testSet.classify(rfClassify);
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
var importance = ee.Dictionary(rfClassify.explain().get('importance'));

var currentGlacierMask = glacier_2024.eq(1).and(peripheralMask);
var susceptibilityMap = predictors
  .updateMask(currentGlacierMask)
  .classify(rfPredict)
  .rename('susceptibility')
  .max(0).min(1);


// ============================================================
// 6. EXPORT MULTI-BAND APP ASSET
// ============================================================

var precomputed = ee.Image.cat([
  glacier_2000.toByte(),
  glacier_2024.toByte(),
  cleanRetreat.toByte(),
  warmingRate.toFloat(),
  lstEarly.toFloat(),
  lstRecent.toFloat(),
  susceptibilityMap.toFloat(),
  elevation.toFloat()
]).clip(AOI_geom).set({
  accuracy: confusionMatrix.accuracy(),
  kappa: confusionMatrix.kappa(),
  precision: precision,
  recall: recall,
  f1: f1,
  n_train: trainSet.size(),
  n_test: testSet.size(),
  importance_elevation: importance.get('elevation'),
  importance_slope: importance.get('slope'),
  importance_warming_rate: importance.get('warming_rate'),
  importance_lst_mean: importance.get('lst_mean'),
  importance_mine_proximity: importance.get('mine_proximity'),
  importance_settlement_proximity: importance.get('settlement_proximity'),
  importance_coast_proximity: importance.get('coast_proximity'),
  export_scale_m: exportScale,
  min_patch_pixels: minPatchPixels,
  validation_split: 'spatial block split: folds 0-6 train, 7-9 test',
  method_note: 'Computed once in gee_preprocess_export.js; output represents retreat susceptibility, not causal risk.'
});

print('Precomputed image preview:', precomputed);
print('Band names:', precomputed.bandNames());
print('Confusion Matrix:', confusionMatrix);
print('Overall Accuracy:', confusionMatrix.accuracy());
print('Kappa:', confusionMatrix.kappa());
print('Precision:', precision);
print('Recall:', recall);
print('F1 score:', f1);
print('Variable Importance:', importance);

Map.centerObject(AOI, 4);
Map.addLayer(susceptibilityMap, {
  min: 0, max: 1,
  palette: ['#2e7d32','#66bb6a','#fff9c4','#ffcc80','#ef6c00','#e53935','#b71c1c']
}, 'Retreat susceptibility preview');
Map.addLayer(cleanRetreat.selfMask(), {palette: ['#ff1744']}, 'Clean retreat preview', false);

Export.image.toAsset({
  image: precomputed,
  description: 'greenland_glacier_mining_precomputed',
  assetId: outputAsset,
  region: greenlandBox,
  crs: exportCrs,
  scale: exportScale,
  maxPixels: 1e13
});
