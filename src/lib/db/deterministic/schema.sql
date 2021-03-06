CREATE TABLE region (
  id SERIAL NOT NULL PRIMARY KEY,

  grid_spacing NUMERIC NOT NULL,
  max_latitude NUMERIC NOT NULL,
  max_longitude NUMERIC NOT NULL,
  min_latitude NUMERIC NOT NULL,
  min_longitude NUMERIC NOT NULL,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE data (
  id SERIAL NOT NULL PRIMARY KEY,
  region_id INTEGER NOT NULL REFERENCES region(id),

  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  pgad NUMERIC NOT NULL,
  s1d NUMERIC NOT NULL,
  ssd NUMERIC NOT NULL
);

CREATE TABLE document (
  id SERIAL NOT NULL PRIMARY KEY,
  region_id INTEGER NOT NULL REFERENCES region(id),

  model_version VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  spatial_interpolation_method VARCHAR(255) NOT NULL
);
