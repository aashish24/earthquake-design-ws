'use strict';


var extend = require('extend'),
    NumberUtils = require('./util/number-utils').instance;


var _DEFAULTS,
    _QUERY_DATA,
    _QUERY_DOCUMENT,
    _QUERY_REGION;


/**
 * @param $1 {Double}
 *     Latitude decimal degrees
 * @param $2 {Double}
 *     Longitude decimal degrees
 * @param $3 {Double}
 *     Grid spacing
 */
_QUERY_DATA = `
  SELECT
    *
  FROM
    data
  WHERE
    region_id = $1 AND
    latitude < ($2::Numeric + $4::Numeric) AND
    latitude > ($2::Numeric - $4::Numeric) AND
    longitude < ($3::Numeric + $4::Numeric) AND
    longitude > ($3::Numeric - $4::Numeric)
  ORDER BY
    latitude DESC,
    longitude ASC
`;

/**
 * @param $1 {Number}
 *     Latitude decimal degrees
 * @paran $2 {Number}
 *     Longitude decimal degrees
 */
_QUERY_REGION = `
  SELECT
    *
  FROM
    region
  WHERE
    max_latitude >= $1 AND
    max_longitude >= $2 AND
    min_latitude <= $1 AND
    min_longitude <= $2
`;

/**
 * @param $1 {Number}
 *     Region ID
 */
_QUERY_DOCUMENT = `
  SELECT
    *
  FROM
    document
  WHERE
    region_id = $1 AND
    name = $2
`;

_DEFAULTS = {
  db: {query: () => Promise.resolve({rows: []})},
  queryData: _QUERY_DATA,
  queryDocument: _QUERY_DOCUMENT,
  queryRegion: _QUERY_REGION
};


/**
 * Factory for fetching arbitrary gridded data from a database. The schema
 * for the database must adhere to specific requirements for this factory to
 * function properly with it.
 *
 * @param options {Object}
 *     options.db {Pool}
 *         A database connection pool
 *     options.queryData {String}
 *         SQL to query data from the schema
 *     options.queryDocument {String}
 *         SQL to query documents from the schema
 *     options.queryRegion {String}
 *         SQL to query regions from the schema
 */
var GriddedDataFactory = function (options) {
  var _this,
      _initialize;


  _this = {};

  /**
   * Constructor.
   *
   * @param options {Object}
   *     See class documentation for details.
   */
  _initialize = function (options) {
    options = extend({}, _DEFAULTS, options);

    _this.db = options.db;
    _this.queryData = options.queryData;
    _this.queryDocument = options.queryDocument;
    _this.queryRegion = options.queryRegion;
  };


  /**
   * Free resources associated with this factory instance.
   *
   */
  _this.destroy = function () {
    if (_this === null) {
      return;
    }

    _initialize = null;
    _this = null;
  };

  /**
   * @APIMethod
   *
   * General method called by a handler to fetch data and metadata from the
   * factory.
   *
   * @param inputs {Object}
   *     Any arbitrary inputs required for queries to succeed. Typically...
   *     inputs.latitude {Number}
   *     inputs.longitude {Number}
   *     inputs.referenceDocument {String}
   *
   * @return {Promise<Object>}
   *     A promise that resolves with the data and metadata for the provided
   *     inputs, or rejects if an error occurs.
   */
  _this.get = function (inputs) {
    var metadata;

    return _this.getMetadata(inputs).then((result) => {
      metadata = result;
      return _this.getData(metadata, inputs);
    }).then((data) => {
      return {
        data: data,
        metadata: metadata
      };
    });
  };

  /**
   * @HelperMethod
   *
   * Fetches the gridded data from the database and resolves the returned
   * promise with the interpolated results.
   *
   * @param metadata {Object}
   *     metadata.region.id {Number}
   *     metadata.region.grid_spacing {Number}
   * @param inputs {Object}
   *     inputs.latitude {Number}
   *     inputs.longitude {Number}
   *
   * @return {Promise<Object>}
   *     A promise that resolves with interpolated results of gridded data
   *     from the database or rejects if an error occurs.
   */
  _this.getData = function (metadata, inputs) {
    var parameters;

    inputs = inputs || {};
    metadata = metadata || {};
    metadata.region = metadata.region || {};

    parameters = [
      parseInt(metadata.region.id, 10),        // _QUERY_DATA::$1
      parseFloat(inputs.latitude),             // _QUERY_DATA::$2
      parseFloat(inputs.longitude),            // _QUERY_DATA::$3
      parseFloat(metadata.region.grid_spacing) // _QUERY_DATA::$4
    ];

    return _this.db.query(_this.queryData, parameters).then((result) => {
      return _this.interpolate(result.rows, inputs, metadata);
    });
  };

  /**
   * @HelperMethod
   *
   * Gets metadata associated with a particular document based on the
   * provided `inputs.referenceDocument` and `region.id`.
   *
   * @param inputs {Object}
   *     inputs.referenceDocument {String}
   * @param region {Object}
   *     region.id {Number}
   *
   * @return {Promise<Object>}
   *     A promise that resolves with document metadata or rejects if an
   *     error occurs.
   */
  _this.getDocument = function (inputs, region) {
    var parameters;

    parameters = [
      parseInt(region.id, 10), // _QUERY_DOCUMENT::$1
      inputs.referenceDocument // _QUERY_DOCUMENT::$2
    ];

    return _this.db.query(_this.queryDocument, parameters).then((result) => {
      return result.rows[0];
    });
  };

  /**
   * @HelperMethod
   *
   * Gets document and region metadata for the provided inputs.
   *
   * @param inputs {Object}
   *     inputs.latitude {Number}
   *     inputs.longitude {Number}
   *     inputs.referenceDocument {String}
   *
   * @return {Promise<Object>}
   *     A promise that resolves with metadata or rejects if an error occurs.
   */
  _this.getMetadata = function (inputs) {
    var region;

    return _this.getRegion(inputs).then((result) => {
      region = result;
      return _this.getDocument(inputs, region);
    }).then((result) => {
      return {
        region: region,
        document: result
      };
    });
  };

  /**
   * Gets metadata associated with a particular region based on the provided
   * `inputs.latitude` and `inputs.longitude`.
   *
   * @param inputs {Object}
   *     inputs.latitude` {Number}
   *     inputs.longitude` {Number}
   *
   * @return {Promise<Object>}
   *     A promise that resolves with region metadata or rejects if an
   *     error occurs.
   */
  _this.getRegion = function (inputs) {
    var parameters;

    parameters = [
      parseFloat(inputs.latitude), // _QUERY_REGION::$1
      parseFloat(inputs.longitude) // _QUERY_REGION::$2
    ];

    return _this.db.query(_this.queryRegion, parameters).then((result) => {
      return result.rows[0];
    });
  };

  /**
   * @HelperMethod
   *
   * Performs bi-linear spatial interpolation on the provided parameters.
   * Currently defers to `NumberUtils.spatialInterpolate` method.
   *
   * @param rows {Array}
   *     An ordered array of results from the database. Contains
   *     latitude/longitude/valueX properties for each matching grid point.
   *     Non-numeric values corresponding to a property on the rows object
   *     will have undefined results.
   * @param inputs {Object}
   *     inputs.latitude {Number}
   *     inputs.longitude {Number}
   * @param metadata {Object}
   *     metadata.document.spatial_interpolation_method {String}
   *
   * @see util/NumberUtils#spatialInterpolate
   *
   * @return {Object}
   *     An object containing spatially interpolated results
   */
  _this.interpolate = function (rows, inputs, metadata) {
    var method;

    if (metadata.document.spatial_interpolation_method === 'log') {
      method = NumberUtils.INTERPOLATE_USING_LOG;
    } else {
      method = NumberUtils.INTERPOLATE_USING_LINEAR;
    }

    return NumberUtils.spatialInterpolate(rows, inputs.latitude,
        inputs.longitude, method);
  };


  _initialize(options);
  options = null;
  return _this;
};


module.exports = GriddedDataFactory;
