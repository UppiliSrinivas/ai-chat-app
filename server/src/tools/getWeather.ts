/** Current weather for a named place, via Open-Meteo. The declaration is what
 *  the model reads; `getWeather` is what runs. */

export type GetWeatherArgs = { place: string };

/** Provider-neutral JSON Schema — mapping it to a provider's own function
 *  declaration belongs to that provider's module, not here. */
export const getWeatherDeclaration = {
  name: "getWeather",
  description:
    "Look up the current weather for a town, city, or region. Use this whenever the user asks about weather, temperature, or conditions somewhere. Returns a live reading, never a forecast for a future date.",
  parameters: {
    type: "object",
    properties: {
      place: {
        type: "string",
        description: 'The place to look up, as the user named it — for example "Chennai" or "Paris, France".',
      },
    },
    required: ["place"],
  },
} as const;

export type WeatherReport = {
  /** What the geocoder matched, which may not be what was asked for. */
  place: string;
  temperatureC: number;
  feelsLikeC: number;
  humidityPercent: number;
  windSpeedKph: number;
  conditions: string;
  observedAt: string;
};

export type WeatherErrorCode = "PLACE_NOT_FOUND" | "PROVIDER_UNAVAILABLE" | "TIMED_OUT";

/** A failed lookup is a normal outcome, not an exception: the model reads the
 *  `code` and explains itself rather than the chat stream dying. */
export type WeatherResult =
  | { ok: true; report: WeatherReport }
  | { ok: false; code: WeatherErrorCode; message: string };

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/** Short on purpose: this runs inside an open SSE stream with a user watching. */
const PROVIDER_TIMEOUT_MS = 5_000;

const CURRENT_FIELDS = "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code";

const WMO_CONDITIONS: Record<number, string> = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "freezing fog",
  51: "light drizzle",
  53: "drizzle",
  55: "heavy drizzle",
  56: "light freezing drizzle",
  57: "freezing drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  66: "light freezing rain",
  67: "freezing rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  77: "snow grains",
  80: "light rain showers",
  81: "rain showers",
  82: "violent rain showers",
  85: "light snow showers",
  86: "snow showers",
  95: "thunderstorm",
  96: "thunderstorm with hail",
  99: "thunderstorm with heavy hail",
};

/** Open-Meteo's wire shapes stop here — nothing outside this file sees
 *  `temperature_2m` or `weather_code`. */
type GeocodeMatch = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
};

type GeocodeResponse = { results?: GeocodeMatch[] };

type CurrentReading = {
  time: string;
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  weather_code: number;
};

type ForecastResponse = { current?: CurrentReading };

const geocodeUrl = (place: string): string =>
  `${GEOCODE_URL}?name=${encodeURIComponent(place)}&count=1&language=en&format=json`;

const forecastUrl = (latitude: number, longitude: number): string =>
  `${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}&current=${CURRENT_FIELDS}&timezone=auto`;

/** "Chennai, Tamil Nadu, India" — enough for the user to spot a wrong match. */
const describePlace = (match: GeocodeMatch): string =>
  [match.name, match.admin1, match.country].filter(Boolean).join(", ");

const toReport = (match: GeocodeMatch, current: CurrentReading): WeatherReport => ({
  place: describePlace(match),
  temperatureC: current.temperature_2m,
  feelsLikeC: current.apparent_temperature,
  humidityPercent: current.relative_humidity_2m,
  windSpeedKph: current.wind_speed_10m,
  conditions: WMO_CONDITIONS[current.weather_code] ?? "unknown conditions",
  observedAt: current.time,
});

const failure = (code: WeatherErrorCode, message: string): WeatherResult => ({ ok: false, code, message });

/** The caller's signal cancels the whole chat; the timeout cancels just this call. */
const deadline = (signal: AbortSignal | undefined): AbortSignal => {
  const timeout = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
};

/** Throws rather than returning null, so an unreachable provider can never be
 *  mistaken further down for a place that doesn't exist. */
const fetchJson = async <T>(url: string, signal: AbortSignal | undefined): Promise<T> => {
  const response = await fetch(url, { signal: deadline(signal) });
  if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
  return (await response.json()) as T;
};

export const getWeather = async (
  { place }: GetWeatherArgs,
  signal?: AbortSignal,
): Promise<WeatherResult> => {
  const query = place.trim();
  if (!query) return failure("PLACE_NOT_FOUND", "No place was given to look up.");

  try {
    const geocoded = await fetchJson<GeocodeResponse>(geocodeUrl(query), signal);

    // A miss omits `results` entirely rather than returning an empty array, so
    // this cannot be a length check.
    const match = geocoded.results?.[0];
    console.log(`[getWeather] "${query}" matched ${match ? describePlace(match) : "nothing"}.`);
    if (!match) return failure("PLACE_NOT_FOUND", `No place called "${query}" was found.`);

    const forecast = await fetchJson<ForecastResponse>(forecastUrl(match.latitude, match.longitude), signal);
    const current = forecast.current;
    if (!current) {
        console.log(`[getWeather] "${query}" matched ${describePlace(match)} but the forecast had no current reading.`);
      return failure("PROVIDER_UNAVAILABLE", `The weather service returned no reading for ${describePlace(match)}.`);
    }

    return { ok: true, report: toReport(match, current) };
  } catch (error) {
    // The chat stream is already gone, so there is nobody to hand a result to.
    if (signal?.aborted) throw error;

    // Logged, not returned: the model gets a sentence it can explain while the
    // cause stays where an operator can read it.
    console.error(`[getWeather] "${query}" failed:`, error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return failure("TIMED_OUT", "The weather service took too long to answer.");
    }
    return failure("PROVIDER_UNAVAILABLE", "The weather service is unavailable right now.");
  }
};

/** The line shown in the chat while this call runs. */
export const describeGetWeatherCall = ({ place }: GetWeatherArgs): string => {
  const query = place.trim();
  if (!query) return "Checking the weather";
  return `Checking the weather in ${query}`;
};
