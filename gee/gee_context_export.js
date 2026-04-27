// ============================================================
// CASA0025 — Greenland Glacier × Mining Nexus
// Display Context / Mask Export Script
// ============================================================
//
// Run this after gee_preprocess_export.js has produced:
// projects/ee-k24081637/assets/0025/greenland_glacier_mining_precomputed
//
// This script exports lightweight display-only layers for the app:
// central/northern Greenland Ice Sheet context and the modelled
// peripheral glacier zone mask. Keeping these separate avoids rerunning
// the heavy Landsat/RF preprocessing just to update map context layers.
// ============================================================


// ============================================================
// 0. PROJECT ASSETS
// ============================================================

var precomputed = ee.Image(
  'projects/ee-k24081637/assets/0025/greenland_glacier_mining_precomputed'
);

var outputAsset =
  'projects/ee-k24081637/assets/0025/greenland_display_context_precomputed';


// ============================================================
// 1. STUDY AREA
// ============================================================

var countries    = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var AOI          = countries.filter(ee.Filter.eq('country_na', 'Greenland'));
var AOI_geom     = AOI.geometry();
var greenlandBox = ee.Geometry.Rectangle([-73, 59, -12, 84]);

var exportCrs   = 'EPSG:3413';
var exportScale = 300;


// ============================================================
// 2. CONTEXT LAYERS
// ============================================================

var elevation = precomputed.select('elevation');

var gimpIceMask = ee.Image('OSU/GIMP/2000_ICE_OCEAN_MASK')
  .select('ice_mask')
  .eq(1)
  .clip(AOI_geom)
  .rename('gimp_ice_mask');

var latitude = ee.Image.pixelLonLat().select('latitude');

// Modelled zone: peripheral land ice where the susceptibility model is
// analytically intended to apply. South of 64°N, ALL ice is included
// regardless of elevation — the southern ice cap (~2800 m peak) is
// genuinely peripheral glacier, not interior ice sheet.
var modelDomain = gimpIceMask
  .and(elevation.lt(2500).or(latitude.lt(64)))
  .rename('model_domain');

// Context zone: central/high-elevation ice sheet shown for cartographic
// completeness, not interpreted as susceptibility prediction.
var iceSheetContext = gimpIceMask
  .and(modelDomain.not())
  .rename('ice_sheet_context');

// Separate northern context flag for optional layer control and reporting.
var northIceContext = gimpIceMask
  .and(latitude.gte(78))
  .rename('north_ice_context');


// ============================================================
// 3. EXPORT CONTEXT ASSET
// ============================================================

var contextAsset = ee.Image.cat([
  gimpIceMask.toByte(),
  modelDomain.toByte(),
  iceSheetContext.toByte(),
  northIceContext.toByte()
]).clip(AOI_geom).set({
  source: 'OSU/GIMP/2000_ICE_OCEAN_MASK + precomputed elevation',
  export_scale_m: exportScale,
  model_domain_note: 'Peripheral GIMP land ice below 2500 m elevation.',
  context_note: 'Central/northern high-elevation ice shown as display context only; southern high-elevation ice is not painted as context.'
});

print('Display context asset preview:', contextAsset);
print('Band names:', contextAsset.bandNames());

Map.centerObject(AOI, 4);
Map.addLayer(iceSheetContext.selfMask(), {palette: ['#f7fbff']},
  'Central/northern ice-sheet context');
Map.addLayer(modelDomain.selfMask(), {palette: ['#00e5ff']},
  'Modelled peripheral glacier zone');

Export.image.toAsset({
  image: contextAsset,
  description: 'greenland_display_context_precomputed',
  assetId: outputAsset,
  region: greenlandBox,
  crs: exportCrs,
  scale: exportScale,
  maxPixels: 1e13
});
