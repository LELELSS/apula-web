import { NextRequest, NextResponse } from "next/server";

const PHOTON_HEADERS = {
  Accept: "application/json",
  "User-Agent": "APULA/1.0 (stations reverse geocoding)",
};

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "APULA/1.0 (fallback reverse geocoding)",
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

const reverseGeocodeViaPhoton = async (lat: string, lng: string) => {
  const upstream = await fetch(
    `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`,
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

  if (!first) {
    return null;
  }

  const coordinates = first?.geometry?.coordinates;

  return {
    lat: String(Array.isArray(coordinates) ? coordinates[1] : lat),
    lon: String(Array.isArray(coordinates) ? coordinates[0] : lng),
    display_name: buildDisplayName(first?.properties || {}) || "",
  };
};

const reverseGeocodeViaNominatim = async (lat: string, lng: string) => {
  const upstream = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`,
    {
      headers: NOMINATIM_HEADERS,
      cache: "no-store",
    }
  );

  if (!upstream.ok) {
    return null;
  }

  const data = await upstream.json();

  if (!data) {
    return null;
  }

  return {
    lat: String(data.lat || lat),
    lon: String(data.lon || lng),
    display_name: String(data.display_name || ""),
  };
};

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat")?.trim();
  const lng = request.nextUrl.searchParams.get("lng")?.trim();

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "Latitude and longitude are required." },
      { status: 400 }
    );
  }

  try {
    const photonResult = await reverseGeocodeViaPhoton(lat, lng);
    if (photonResult?.display_name) {
      return NextResponse.json(photonResult);
    }

    const nominatimResult = await reverseGeocodeViaNominatim(lat, lng);
    if (nominatimResult?.display_name) {
      return NextResponse.json(nominatimResult);
    }

    if (photonResult) {
      return NextResponse.json(photonResult);
    }

    return NextResponse.json(
      { error: "Unable to resolve location name for these coordinates." },
      { status: 404 }
    );
  } catch (error) {
    console.error("Reverse geocode proxy error:", error);
    return NextResponse.json(
      { error: "Unable to look up address right now." },
      { status: 500 }
    );
  }
}
