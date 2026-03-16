import { NextRequest, NextResponse } from "next/server";

const PHOTON_HEADERS = {
  Accept: "application/json",
  "User-Agent": "APULA/1.0 (stations geocoding)",
};

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "APULA/1.0 (fallback geocoding)",
};

const buildDisplayName = (properties: Record<string, unknown>) => {
  const parts = [
    properties.name,
    properties.street,
    properties.housenumber,
    properties.district,
    properties.city,
    properties.state,
    properties.country,
    properties.postcode,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  return parts.join(", ");
};

const geocodeViaPhoton = async (query: string) => {
  const upstream = await fetch(
    `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`,
    {
      headers: PHOTON_HEADERS,
      cache: "no-store",
    }
  );

  if (!upstream.ok) {
    return null;
  }

  const data = await upstream.json();
  const first = Array.isArray(data?.features) ? data.features[0] : null;

  if (!first?.geometry?.coordinates || first.geometry.coordinates.length < 2) {
    return null;
  }

  const [lon, lat] = first.geometry.coordinates;
  const displayName = buildDisplayName(first.properties || {});

  return {
    lat: String(lat),
    lon: String(lon),
    display_name: displayName || query,
  };
};

const geocodeViaNominatim = async (query: string) => {
  const upstream = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
    {
      headers: NOMINATIM_HEADERS,
      cache: "no-store",
    }
  );

  if (!upstream.ok) {
    return null;
  }

  const data = await upstream.json();
  const first = Array.isArray(data) ? data[0] : null;

  if (!first?.lat || !first?.lon) {
    return null;
  }

  return {
    lat: String(first.lat),
    lon: String(first.lon),
    display_name: String(first.display_name || query),
  };
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ error: "Query is required." }, { status: 400 });
  }

  try {
    const photonResult = await geocodeViaPhoton(query);
    if (photonResult) {
      return NextResponse.json([photonResult]);
    }

    const nominatimResult = await geocodeViaNominatim(query);
    if (nominatimResult) {
      return NextResponse.json([nominatimResult]);
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error("Geocode proxy error:", error);
    return NextResponse.json(
      { error: "Unable to search address right now." },
      { status: 500 }
    );
  }
}
