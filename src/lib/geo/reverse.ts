/**
 * 逆ジオコーディング（仕様書 F-22）。緯度経度→住所。
 * プロバイダは GEOCODER 環境変数で切替:
 *   - "gsi"(既定): 国土地理院 逆ジオコーダ（無料・キー不要・日本国内）。町名(lv01Nm)を返す。
 *   - "google": Google Maps Geocoding（GOOGLE_MAPS_API_KEY 必須・高精度）。
 *   - "none": 無効（null）。
 * いずれもベストエフォート（失敗時 null）。短いタイムアウトで打刻のレイテンシを抑える。
 */
export interface ReverseResult {
  address: string | null;
  raw?: unknown;
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 4000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function gsiReverse(lat: number, lng: number): Promise<ReverseResult> {
  const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return { address: null };
  const data = (await res.json()) as { results?: { muniCd?: string; lv01Nm?: string } };
  const r = data.results;
  if (!r || !r.lv01Nm || r.lv01Nm === "－") return { address: null, raw: data };
  return { address: r.lv01Nm, raw: data };
}

async function googleReverse(lat: number, lng: number, key: string): Promise<ReverseResult> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ja&key=${key}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return { address: null };
  const data = (await res.json()) as { results?: { formatted_address?: string }[] };
  return { address: data.results?.[0]?.formatted_address ?? null, raw: data };
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult> {
  const provider = process.env.GEOCODER ?? "gsi";
  try {
    if (provider === "none") return { address: null };
    if (provider === "google") {
      const key = process.env.GOOGLE_MAPS_API_KEY;
      if (!key) return { address: null };
      return await googleReverse(lat, lng, key);
    }
    return await gsiReverse(lat, lng);
  } catch {
    return { address: null };
  }
}
