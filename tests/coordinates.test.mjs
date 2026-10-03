import test from "node:test";
import assert from "node:assert/strict";
import { gpsToAmapPoint } from "../public/coordinates.js";

test("GPS fallback converts a mainland browser position to a nearby AMap coordinate", () => {
  const raw = { lng: 120.067, lat: 30.297 };
  const point = gpsToAmapPoint(raw);
  assert.ok(point.lng > raw.lng + 0.002 && point.lng < raw.lng + 0.01);
  assert.ok(Math.abs(point.lat - raw.lat) < 0.01);
});

test("GPS fallback leaves locations outside the conversion region unchanged", () => {
  assert.deepEqual(gpsToAmapPoint({ lng: -73.985, lat: 40.758 }), { lng: -73.985, lat: 40.758 });
  assert.equal(gpsToAmapPoint({ lng: "bad", lat: 30 }), null);
});
