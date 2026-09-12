import { afterEach, describe, expect, it, vi } from "vitest";
import { describeGetWeatherCall, getWeather, getWeatherDeclaration } from "./getWeather.js";

/** Shaped from real Open-Meteo responses, so a change in their wire format
 *  shows up here rather than in production. */
const CHENNAI_MATCH = {
  name: "Chennai",
  latitude: 13.08784,
  longitude: 80.27847,
  country: "India",
  admin1: "Tamil Nadu",
};

const CURRENT_READING = {
  time: "2026-09-12T11:00",
  interval: 900,
  temperature_2m: 32.6,
  apparent_temperature: 38.6,
  relative_humidity_2m: 62,
  wind_speed_10m: 11.4,
  weather_code: 3,
};

const asResponse = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

const isGeocode = (url: string) => url.includes("geocoding-api");

/** Dispatches on the URL because a lookup makes two calls in sequence. */
const stubFetch = (handler: (url: string) => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (input: unknown) => handler(String(input)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const stubHappyPath = (current: unknown = CURRENT_READING, match: unknown = CHENNAI_MATCH) =>
  stubFetch((url) => asResponse(isGeocode(url) ? { results: [match] } : { current }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getWeatherDeclaration", () => {
  it("declares the one argument the model must supply", () => {
    expect(getWeatherDeclaration.name).toBe("getWeather");
    expect(getWeatherDeclaration.parameters.required).toEqual(["place"]);
    expect(getWeatherDeclaration.parameters.properties.place.type).toBe("string");
  });
});

describe("getWeather", () => {
  it("reports the current reading for a place it can find", async () => {
    const fetchMock = stubHappyPath();

    const result = await getWeather({ place: "Chennai" });

    expect(result).toEqual({
      ok: true,
      report: {
        place: "Chennai, Tamil Nadu, India",
        temperatureC: 32.6,
        feelsLikeC: 38.6,
        humidityPercent: 62,
        windSpeedKph: 11.4,
        conditions: "overcast",
        observedAt: "2026-09-12T11:00",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("looks up the forecast at the coordinates the geocoder returned", async () => {
    const fetchMock = stubHappyPath();

    await getWeather({ place: "Chennai" });

    const forecastUrl = String(fetchMock.mock.calls[1]![0]);
    expect(forecastUrl).toContain("latitude=13.08784");
    expect(forecastUrl).toContain("longitude=80.27847");
  });

  it("names only the parts of the place the geocoder knew", async () => {
    stubHappyPath(CURRENT_READING, { name: "Atlantis", latitude: 0, longitude: 0 });

    const result = await getWeather({ place: "Atlantis" });

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    expect(result.ok && result.report.place).toBe("Atlantis");
  });

  it("falls back to a readable label for a WMO code it does not know", async () => {
    stubHappyPath({ ...CURRENT_READING, weather_code: 404 });

    const result = await getWeather({ place: "Chennai" });

    expect(result.ok && result.report.conditions).toBe("unknown conditions");
  });

  // The geocoder omits `results` entirely on a miss rather than returning an
  // empty array, so this is the case a length check would crash on.
  it("reports PLACE_NOT_FOUND when the response carries no results key", async () => {
    stubFetch(() => asResponse({ generationtime_ms: 0.51 }));

    const result = await getWeather({ place: "zzzznotaplace" });

    expect(result).toEqual({
      ok: false,
      code: "PLACE_NOT_FOUND",
      message: 'No place called "zzzznotaplace" was found.',
    });
  });

  it("rejects a blank place without calling the provider", async () => {
    const fetchMock = stubHappyPath();

    const result = await getWeather({ place: "   " });

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "PLACE_NOT_FOUND" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports PROVIDER_UNAVAILABLE when the forecast carries no reading", async () => {
    stubFetch((url) => asResponse(isGeocode(url) ? { results: [CHENNAI_MATCH] } : {}));

    const result = await getWeather({ place: "Chennai" });

    expect(result).toEqual({
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "The weather service returned no reading for Chennai, Tamil Nadu, India.",
    });
  });

  // A geocoder that is down must not be reported as a place that doesn't exist.
  it("separates a provider error status from a place that isn't found", async () => {
    stubFetch(() => asResponse({}, false));

    const result = await getWeather({ place: "Paris" });

    expect(result).toEqual({
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "The weather service is unavailable right now.",
    });
  });

  it("reports TIMED_OUT when the provider does not answer in time", async () => {
    stubFetch(() => {
      throw Object.assign(new Error("signal timed out"), { name: "TimeoutError" });
    });

    const result = await getWeather({ place: "Chennai" });

    expect(result).toEqual({
      ok: false,
      code: "TIMED_OUT",
      message: "The weather service took too long to answer.",
    });
  });

  it("reports PROVIDER_UNAVAILABLE when the network fails outright", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });

    const result = await getWeather({ place: "Chennai" });

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "PROVIDER_UNAVAILABLE" }));
  });

  // Nothing is left to hand a result to, so this must not be swallowed into a
  // tool result the model would then try to explain.
  it("rethrows when the caller aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    stubFetch(() => {
      throw new Error("This operation was aborted");
    });

    await expect(getWeather({ place: "Chennai" }, controller.signal)).rejects.toThrow("aborted");
  });
});

describe("describeGetWeatherCall", () => {
  it("names the place being looked up", () => {
    expect(describeGetWeatherCall({ place: "Paris" })).toBe("Checking the weather in Paris");
  });

  it("drops the place when there isn't one to name", () => {
    expect(describeGetWeatherCall({ place: "   " })).toBe("Checking the weather");
  });
});
