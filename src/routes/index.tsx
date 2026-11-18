import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { AuthScreen } from "@/components/AuthScreen";
import { PriceReviewPanel } from "@/components/PriceReviewPanel";
import { ArrowRight, Bell, Bookmark, Camera, Check, Compass, Heart, Home, MapPin, LocateFixed, MessageCircle, Moon, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Send, Settings2, Share2, ShoppingBag, Sparkles, Sun, Trash2, UserRound, Utensils, Wallet, X, Zap } from "lucide-react";

type Tab = "home" | "map" | "ai" | "search" | "profile";
type UserProfile = { id: string; username: string | null; display_name: string; avatar_url: string | null; bio: string | null; created_at: string };
type ProfileAsset = { id:string; slug:string; name:string; asset_type:"avatar"|"avatar_decoration"|"banner"|"badge"; asset_url:string; rarity:string; description:string; is_free:boolean; sort_order:number; animation_type:"none"|"float"|"pulse"|"bob"|"glow"|"spin"|"orbit"|"shimmer"|"twinkle"|"flicker"|"drift"|"bounce"; fit_config:CSSProperties|null };
type EquippedProfile = { user_id:string; avatar_asset_id:string|null; decoration_asset_id:string|null; banner_asset_id:string|null };
type ProfileBadge = { asset_id:string; is_featured:boolean; unlocked_at:string };
type PriceHistoryResult = { id:string; product_id:string; store_id:string; price:number; price_type:string; source_label:string; observed_at:string; store_name:string; store_city:string; store_state:string; is_online:boolean };
type MonitoringIntegration = { id:string; name:string; category:string; city:string; state:string; verifiedPrices:number; products:number; updatedLast24h:number; lastObservedAt:string|null };
type MonitoringRun = { id:string; started_at:string; finished_at:string|null; status:"running"|"success"|"partial"|"failed"; trigger_source:string; requested_source:string; summary:{ totalPricesInserted?:number; totalNewProductsCreated?:number; totalDuplicatePricesSkipped?:number; totalProductsFound?:number }|null; error_message:string|null };
type MonitoringDashboard = { generatedAt:string; scheduleLabel:string; totals:{ activeProducts:number; verifiedPrices:number; onlineChannels:number }; lastSyncAt:string|null; integrations:MonitoringIntegration[]; recentRuns:MonitoringRun[] };
type FeedPost = { id: string; user_id: string; content: string; image_url: string | null; location_name: string | null; created_at: string; author: UserProfile | null; likes_count: number; comments_count: number; liked: boolean };
type FeedComment = { id: string; content: string; created_at: string; user_id: string; author: UserProfile | null };
type Store = { id:string; name:string; category:string; address:string; city:string; state:string; latitude:number|null; longitude:number|null; website_url:string|null; brand_name:string|null; brand_slug:string|null; brand_logo_url:string|null; coordinate_precision:string|null; coordinate_source:string|null; geocoded_at:string|null; geocode_attempted_at:string|null; google_place_id:string|null; google_match_status:string|null; google_checked_at:string|null; google_verified_at:string|null; source_url:string|null; source_label:string|null; osm_type:string|null; osm_id:number|null; osm_last_seen_at:string|null };
type UserLocation = { lat:number; lon:number; accuracy:number|null; precision:"precise"|"approximate"|"manual"|"city" };
type MapStore = Store & { distance:number|null; mapPrice?:number|null; mapPriceType?:string|null; mapPriceObservedAt?:string|null; mapPriceSource?:string|null; mapProductLabel?:string|null };
type CatalogProduct = { id:string; name:string; normalized_name:string; brand:string|null; variant:string|null; unit:string|null; category:string };
type PriceResult = { id:string; price:number; price_type:string; source_url:string|null; source_label:string; observed_at:string; availability_status:string; is_online:boolean; is_stale:boolean; age_hours:number; store:Store; product:{id:string;name:string;brand:string|null;variant:string|null;unit:string|null;category:string} };
type ChatPriceResult = { id:string; productName:string; brand:string|null; variant:string|null; unit:string|null; storeName:string; storeAddress:string; storeCity:string; storeState:string; isOnline:boolean; price:number; currency:string; priceType:string; sourceLabel:string; sourceUrl:string|null; observedAt:string; availabilityStatus:"available"|"unknown"; distanceKm:number|null };
type ChatMessage = { role:"assistant"|"user"; text:string; results?:ChatPriceResult[] };
type LeafletMap = { setView(center:[number,number],zoom:number):LeafletMap; fitBounds(bounds:Array<[number,number]>,options?:Record<string,unknown>):LeafletMap; on(event:string,handler:(event:{latlng:{lat:number;lng:number}})=>void):LeafletMap; remove():void; invalidateSize():void };
type LeafletCircle = { addTo(layer:LeafletLayerGroup):LeafletCircle };
type LeafletLayerGroup = { clearLayers():void; addTo(map:LeafletMap):LeafletLayerGroup };
type LeafletMarker = { addTo(layer:LeafletLayerGroup):LeafletMarker; bindPopup(html:string):LeafletMarker; on(event:string,handler:()=>void):LeafletMarker };
type LeafletTileLayer = { addTo(map:LeafletMap):LeafletTileLayer; remove():void };
type MapLibreMap = {
  on(event:string,handler:(event?:unknown)=>void):MapLibreMap;
  getStyle():{layers:Array<{id:string;type:string}>};
  setPaintProperty(layerId:string,property:string,value:unknown):void;
};
type LeafletMapLibreLayer = { addTo(map:LeafletMap):LeafletMapLibreLayer; getMaplibreMap():MapLibreMap; remove():void };
type LeafletApi = {
  map(container:HTMLElement,options?:Record<string,unknown>):LeafletMap;
  tileLayer(url:string,options?:Record<string,unknown>):LeafletTileLayer;
  layerGroup():LeafletLayerGroup;
  markerClusterGroup?(options?:Record<string,unknown>):LeafletLayerGroup;
  maplibreGL?(options:Record<string,unknown>):LeafletMapLibreLayer;
  divIcon(options:Record<string,unknown>):unknown;
  marker(coords:[number,number],options?:Record<string,unknown>):LeafletMarker;
  circle(coords:[number,number],options:Record<string,unknown>):LeafletCircle;
};
declare global {
  interface Window {
    L?:LeafletApi;
    maplibregl?:unknown;
    MaplibreGLLeaflet?:{maplibreGL:(options:Record<string,unknown>)=>LeafletMapLibreLayer};
  }
}
let leafletLoader:Promise<LeafletApi>|null=null;

function ensureStylesheet(href:string,dataAttribute:string){
  const selector=`link[data-${dataAttribute}]`;
  if(document.querySelector(selector))return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href=href;
  link.setAttribute(`data-${dataAttribute}`,"true");
  document.head.appendChild(link);
}

function loadExternalScript(src:string,dataAttribute:string,isReady:()=>boolean):Promise<void>{
  if(isReady())return Promise.resolve();
  const selector=`script[data-${dataAttribute}]`;
  const existing=document.querySelector<HTMLScriptElement>(selector);
  if(existing?.dataset.loaded==="true"){
    return isReady()?Promise.resolve():Promise.reject(new Error("O recurso do mapa foi carregado, mas não inicializou."));
  }
  return new Promise((resolve,reject)=>{
    const script=existing||document.createElement("script");
    script.addEventListener("load",()=>{
      script.dataset.loaded="true";
      if(isReady())resolve();
      else reject(new Error("O recurso do mapa não foi inicializado corretamente."));
    },{once:true});
    script.addEventListener("error",()=>reject(new Error("Falha ao carregar um recurso do mapa.")),{once:true});
    if(!existing){
      script.src=src;
      script.async=true;
      script.setAttribute(`data-${dataAttribute}`,"true");
      document.head.appendChild(script);
    }
  });
}

function ensureLeaflet():Promise<LeafletApi>{
  if(typeof window==="undefined")return Promise.reject(new Error("Mapa indisponível neste ambiente."));
  if(!leafletLoader){
    leafletLoader=(async()=>{
      ensureStylesheet("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css","zorvi-leaflet");
      await loadExternalScript(
        "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
        "zorvi-leaflet",
        ()=>Boolean(window.L),
      );
      const leaflet=window.L;
      if(!leaflet)throw new Error("Não foi possível inicializar o mapa.");

      // OpenFreeMap supplies a real dark vector basemap without an API key.
      // Keep Leaflet as the interaction layer and fall back to OSM raster if WebGL/CDN fails.
      try{
        ensureStylesheet("https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl.css","zorvi-maplibre");
        await loadExternalScript(
          "https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl.js",
          "zorvi-maplibre",
          ()=>Boolean(window.maplibregl),
        );
        await loadExternalScript(
          "https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js",
          "zorvi-maplibre-leaflet",
          ()=>Boolean(window.MaplibreGLLeaflet?.maplibreGL),
        );
        if(window.MaplibreGLLeaflet?.maplibreGL)leaflet.maplibreGL=window.MaplibreGLLeaflet.maplibreGL;
      }catch(error){
        console.warn("[ZORVI] Base vetorial indisponível; usando OpenStreetMap como alternativa.",error);
      }

      // Cluster nearby businesses to keep the map readable on mobile.
      try{
        ensureStylesheet("https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css","zorvi-markercluster");
        await loadExternalScript(
          "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js",
          "zorvi-markercluster",
          ()=>typeof leaflet.markerClusterGroup==="function",
        );
      }catch(error){
        console.warn("[ZORVI] Agrupamento de marcadores indisponível; usando marcadores individuais.",error);
      }
      return leaflet;
    })().catch(error=>{
      leafletLoader=null;
      throw error;
    });
  }
  return leafletLoader;
}
function formatMapPrice(value:number){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value);}
const PROFILE_ANIMATION_TYPES = new Set(["float","pulse","bob","glow","spin","orbit","shimmer","twinkle","flicker","drift","bounce"]);
function getProfileAnimationClass(animationType?:string|null){
  return animationType && PROFILE_ANIMATION_TYPES.has(animationType) ? "asset-motion-" + animationType : "";
}
function getDecorationFitStyle(asset:ProfileAsset|null):CSSProperties{
  const defaults:Record<string,CSSProperties>={
    "decoration-orbit":{top:"-14%",left:"-14%",width:"128%",height:"128%",objectFit:"contain"},
    "decoration-halo":{top:"-12%",left:"-12%",width:"124%",height:"124%",objectFit:"contain"},
    "decoration-crown":{top:"-27%",left:"-19%",width:"138%",height:"138%",objectFit:"contain"},
    "decoration-laurel":{top:"-18%",left:"-20%",width:"140%",height:"140%",objectFit:"contain"},
  };
  return {top:"-14%",left:"-14%",width:"128%",height:"128%",objectFit:"contain",...(asset ? defaults[asset.slug] || {} : {}),...(asset?.fit_config || {})};
}
function getMapPriceLabel(priceType:string|null|undefined){if(priceType==="estimated") return "Estimativa";if(priceType==="official_site") return "Preço publicado no site oficial";if(priceType==="community_report") return "Relato da comunidade validado";if(priceType==="in_store") return "Preço informado em loja";return "Preço verificado";}
function escapeMapHtml(value:string){const entities:Record<string,string>={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};return value.replace(/[&<>"']/g,char=>entities[char]||char);}
function getStoreBrand(store:Pick<Store,"name"|"brand_name"|"brand_slug"|"category">){
  const name=store.brand_name||store.name.split(" - ")[0].split(" — ")[0];
  const slug=store.brand_slug||(name.toLowerCase().includes("drogasil")?"drogasil":name.toLowerCase().includes("globo")?"globo":name.toLowerCase().includes("pague menos")?"pague-menos":"");
  const initials=slug==="pague-menos"?"PM":slug==="globo"?"G":slug==="drogasil"?"D":slug==="pao-de-acucar"?"P":slug==="atacadao"?"A":slug==="carvalho"?"C":slug==="ferreira"?"F":slug==="mix-atacarejo"?"MIX":name.trim().charAt(0).toUpperCase()||"L";
  const color=slug==="drogasil"?"#E52B36":slug==="globo"?"#0B9DD9":slug==="pague-menos"?"#E95B28":slug==="pao-de-acucar"?"#F0B323":slug==="atacadao"?"#E53935":slug==="carvalho"?"#16834A":slug==="ferreira"?"#2873B8":slug==="mix-atacarejo"?"#E58A18":store.category==="Mercado"?"#159A63":store.category==="Restaurante"?"#D97706":"#7200FF";
  return {name,slug,initials,color};
}

function getStoreBrandLogo(store:Pick<Store,"name"|"brand_name"|"brand_slug"|"category"|"brand_logo_url">){
  const brand=getStoreBrand(store);
  // Mix uses the bundled icon so its marker never depends on a remote image URL or stale DB cache.
  if(brand.slug==="mix-atacarejo") return "/brands/mix-mateus-icon.png?v=2";
  const logoUrl=store.brand_logo_url?.trim()||"";
  return /^https?:\/\//i.test(logoUrl) ? logoUrl : "";
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(lat2 - lat1);
  const longitudeDelta = radians(lon2 - lon1);
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

function applyZorviMapPalette(map: MapLibreMap) {
  const layers = map.getStyle().layers;
  const layerIds = new Set(layers.map((layer) => layer.id));
  const applied: string[] = [];
  const missing = new Set<string>();

  // These IDs match the exact OpenFreeMap Dark style used by ZORVI.
  // Each paint update is isolated so one unsupported property cannot cancel the palette.
  const paint = (layerId: string, property: string, value: unknown) => {
    if (!layerIds.has(layerId)) {
      missing.add(layerId);
      return;
    }
    try {
      map.setPaintProperty(layerId, property, value);
      applied.push(`${layerId}.${property}`);
    } catch (error) {
      console.warn(`[ZORVI] Não foi possível estilizar ${layerId}.${property}.`, error);
    }
  };

  // Base: purple-black land, visible green spaces, water and building blocks.
  paint("background", "background-color", "#12101A");
  paint("water", "fill-color", "#1B3047");
  paint("landuse_residential", "fill-color", "#211B2B");
  paint("landuse_residential", "fill-opacity", 0.92);
  paint("landcover_wood", "fill-color", "#1B382C");
  paint("landcover_wood", "fill-opacity", 1);
  paint("landuse_park", "fill-color", "#254632");
  paint("building", "fill-color", "#2A2335");
  paint("building", "fill-outline-color", "#493B5B");
  paint("road_area_pier", "fill-color", "#3A2C49");
  paint("road_pier", "line-color", "#80669F");
  paint("waterway", "line-color", "#416E9A");
  paint("water_name", "text-color", "#9DB9D8");
  paint("water_name", "text-halo-color", "#12101A");

  // Local streets stay quiet; main avenues have a clear visual hierarchy.
  paint("highway_path", "line-color", "#79678E");
  paint("highway_path", "line-opacity", 0.95);
  paint("highway_minor", "line-color", "#685779");
  paint("highway_minor", "line-opacity", 1);
  paint("highway_minor", "line-width", [
    "interpolate", ["linear"], ["zoom"],
    12, 0.8,
    15, 1.25,
    18, 2.4,
    20, 3.4,
  ]);
  paint("highway_major_casing", "line-color", "#9275B3");
  paint("highway_major_casing", "line-width", [
    "interpolate", ["linear"], ["zoom"],
    10, 1.8,
    15, 3.2,
    19, 6.5,
  ]);
  paint("highway_major_inner", "line-color", "#49365F");
  paint("highway_major_inner", "line-width", [
    "interpolate", ["linear"], ["zoom"],
    10, 1.1,
    15, 2.1,
    19, 4.8,
  ]);
  paint("highway_major_subtle", "line-color", "#705A8B");
  paint("highway_motorway_casing", "line-color", "#B08AD8");
  paint("highway_motorway_inner", "line-color", "#62427F");
  paint("highway_motorway_subtle", "line-color", "#8C6AB0");
  paint("railway_transit", "line-color", "#9A79B8");
  paint("railway_minor", "line-color", "#806493");
  paint("railway", "line-color", "#9A79B8");

  // Street and place names stay readable over the custom dark basemap.
  paint("highway_name_other", "text-color", "#C6B8D8");
  paint("highway_name_other", "text-halo-color", "#171321");
  paint("highway_name_other", "text-halo-width", 1.6);
  paint("highway_name_motorway", "text-color", "#E0CBF5");
  for (const layerId of [
    "place_other",
    "place_suburb",
    "place_village",
    "place_town",
    "place_city",
    "place_city_large",
    "place_state",
    "place_country_other",
    "place_country_minor",
    "place_country_major",
  ]) {
    paint(layerId, "text-color", "#E6D9F2");
    paint(layerId, "text-halo-color", "#171321");
    paint(layerId, "text-halo-width", 1.8);
  }

  console.info("[ZORVI] Paleta cartográfica aplicada:", {
    style: "OpenFreeMap Dark",
    appliedPaintProperties: applied.length,
    layersFound: layers.length,
    missingLayers: [...missing],
  });
}

// OpenStreetMap raster tiles remain available as a no-key fallback if vector/WebGL is unavailable.
const MAP_FALLBACK_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAP_FALLBACK_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

const BRAZIL_STATES = [
  { code: "AC", name: "Acre" }, { code: "AL", name: "Alagoas" }, { code: "AP", name: "Amapá" }, { code: "AM", name: "Amazonas" },
  { code: "BA", name: "Bahia" }, { code: "CE", name: "Ceará" }, { code: "DF", name: "Distrito Federal" }, { code: "ES", name: "Espírito Santo" },
  { code: "GO", name: "Goiás" }, { code: "MA", name: "Maranhão" }, { code: "MT", name: "Mato Grosso" }, { code: "MS", name: "Mato Grosso do Sul" },
  { code: "MG", name: "Minas Gerais" }, { code: "PA", name: "Pará" }, { code: "PB", name: "Paraíba" }, { code: "PR", name: "Paraná" },
  { code: "PE", name: "Pernambuco" }, { code: "PI", name: "Piauí" }, { code: "RJ", name: "Rio de Janeiro" }, { code: "RN", name: "Rio Grande do Norte" },
  { code: "RS", name: "Rio Grande do Sul" }, { code: "RO", name: "Rondônia" }, { code: "RR", name: "Roraima" }, { code: "SC", name: "Santa Catarina" },
  { code: "SP", name: "São Paulo" }, { code: "SE", name: "Sergipe" }, { code: "TO", name: "Tocantins" },
];
const BRAZIL_STATE_NAMES: Record<string, string> = Object.fromEntries(BRAZIL_STATES.map((state) => [state.code, state.name]));
function normalizeRegionText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function storeMatchesRegion(store: Pick<Store, "city" | "state">, city: string, stateCode: string) {
  const storeCity = normalizeRegionText(store.city || "");
  const expectedCity = normalizeRegionText(city);
  const storeState = normalizeRegionText(store.state || "");
  const expectedState = normalizeRegionText(BRAZIL_STATE_NAMES[stateCode.toUpperCase()] || stateCode);
  const stateAbbreviation = normalizeRegionText(stateCode);
  const stateMatches = Boolean(storeState) && (storeState === expectedState || storeState === stateAbbreviation || storeState.includes(expectedState) || expectedState.includes(storeState));
  return Boolean(storeCity && expectedCity && storeCity === expectedCity && stateMatches);
}
async function geocodeCityCenter(city: string, stateCode: string): Promise<{ lat: number; lon: number } | null> {
  const stateName = BRAZIL_STATE_NAMES[stateCode.toUpperCase()] || stateCode;
  const url = new URL("https://photon.komoot.io/api");
  url.searchParams.set("q", [city, stateName, "Brasil"].join(", "));
  url.searchParams.set("countrycode", "br");
  url.searchParams.set("limit", "8");
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Não foi possível localizar esta cidade agora.");
  const payload = await response.json() as { features?: Array<{ geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }> };
  const expectedCity = normalizeRegionText(city);
  const expectedState = normalizeRegionText(stateName);
  const feature = (payload.features || []).find((item) => {
    const properties = item.properties || {};
    const resultCity = normalizeRegionText(String(properties.city || properties.locality || properties.name || ""));
    const resultState = normalizeRegionText(String(properties.state || ""));
    const country = normalizeRegionText(String(properties.country || ""));
    const coordinates = item.geometry?.coordinates;
    return resultCity === expectedCity
      && (resultState === expectedState || resultState.includes(expectedState) || expectedState.includes(resultState))
      && (!country || country.includes("brasil") || country.includes("brazil"))
      && Array.isArray(coordinates) && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1]);
  });
  const coordinates = feature?.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;
  const lon = Number(coordinates[0]), lat = Number(coordinates[1]);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}


function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileAssets, setProfileAssets] = useState<ProfileAsset[]>([]);
  const [profileInventoryIds, setProfileInventoryIds] = useState<string[]>([]);
  const [equippedProfile, setEquippedProfile] = useState<EquippedProfile|null>(null);
  const [profileBadges, setProfileBadges] = useState<ProfileBadge[]>([]);
  const [isZorviAdmin, setIsZorviAdmin] = useState(false);
  const [monitoringData, setMonitoringData] = useState<MonitoringDashboard|null>(null);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [monitoringError, setMonitoringError] = useState("");
  const [profileAssetTab, setProfileAssetTab] = useState<"avatar"|"decoration"|"banner"|"badge">("avatar");
  const [selectedAvatarAssetId, setSelectedAvatarAssetId] = useState<string|null>(null);
  const [selectedDecorationAssetId, setSelectedDecorationAssetId] = useState<string|null>(null);
  const [selectedBannerAssetId, setSelectedBannerAssetId] = useState<string|null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => { const splashTimer = window.setTimeout(() => setShowSplash(false), 1500); return () => window.clearTimeout(splashTimer); }, []);
  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setAuthLoading(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);
  const accountName = String(profile?.display_name || session?.user.user_metadata?.display_name || session?.user.email?.split("@")[0] || "Explorador");
  const accountInitial = accountName.trim().charAt(0).toUpperCase() || "Z";
  const equippedAvatarAsset = profileAssets.find((asset) => asset.id === equippedProfile?.avatar_asset_id) || null;
  const equippedDecorationAsset = profileAssets.find((asset) => asset.id === equippedProfile?.decoration_asset_id) || null;
  const equippedBannerAsset = profileAssets.find((asset) => asset.id === equippedProfile?.banner_asset_id) || null;
  const selectedAvatarAsset = profileAssets.find((asset) => asset.id === selectedAvatarAssetId) || null;
  const selectedDecorationAsset = profileAssets.find((asset) => asset.id === selectedDecorationAssetId) || null;
  const selectedBannerAsset = profileAssets.find((asset) => asset.id === selectedBannerAssetId) || null;
  const currentAvatarUrl = profile?.avatar_url || equippedAvatarAsset?.asset_url || "";
  const featuredBadges = profileBadges.filter((badge) => badge.is_featured).map((badge) => profileAssets.find((asset) => asset.id === badge.asset_id)).filter((asset): asset is ProfileAsset => Boolean(asset));
  useEffect(() => {
    if (!session?.user.id || !supabase) {
      setProfile(null); setProfileAssets([]); setProfileInventoryIds([]); setEquippedProfile(null); setProfileBadges([]);
      return;
    }
    let active = true;
    setProfileLoading(true);
    const userId = session.user.id;
    Promise.all([
      supabase.from("profiles").select("id, username, display_name, avatar_url, bio, created_at").eq("id", userId).maybeSingle(),
      supabase.from("profile_assets").select("id,slug,name,asset_type,asset_url,rarity,description,is_free,sort_order,animation_type,fit_config").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("user_profile_inventory").select("asset_id").eq("user_id", userId),
      supabase.from("user_profile_equipped").select("user_id,avatar_asset_id,decoration_asset_id,banner_asset_id").eq("user_id", userId).maybeSingle(),
      supabase.from("user_profile_badges").select("asset_id,is_featured,unlocked_at").eq("user_id", userId).order("unlocked_at", { ascending: true })
    ]).then(([profileResult, assetsResult, inventoryResult, equippedResult, badgesResult]) => {
      if (!active) return;
      const firstError = [profileResult, assetsResult, inventoryResult, equippedResult, badgesResult].find((result) => result.error)?.error;
      if (firstError) notify(firstError.message);
      if (profileResult.data) setProfile(profileResult.data as UserProfile);
      setProfileAssets((assetsResult.data || []) as ProfileAsset[]);
      setProfileInventoryIds((inventoryResult.data || []).map((row) => row.asset_id));
      setEquippedProfile((equippedResult.data || null) as EquippedProfile|null);
      setProfileBadges((badgesResult.data || []) as ProfileBadge[]);
      setProfileLoading(false);
    }).catch((error) => {
      if (active) { notify(error instanceof Error ? error.message : "Não foi possível carregar seu perfil."); setProfileLoading(false); }
    });
    return () => { active = false; };
  }, [session?.user.id]);
  const openProfileEditor = () => {
    setEditName(profile?.display_name || accountName);
    setEditUsername(profile?.username || "");
    setEditBio(profile?.bio || "");
    setAvatarFile(null);
    setAvatarPreview(profile?.avatar_url || "");
    setSelectedAvatarAssetId(equippedProfile?.avatar_asset_id || null);
    setSelectedDecorationAssetId(equippedProfile?.decoration_asset_id || null);
    setSelectedBannerAssetId(equippedProfile?.banner_asset_id || null);
    setProfileAssetTab("avatar");
    setEditProfileOpen(true);
  };
  const chooseAvatar = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { notify("Use uma imagem JPG, PNG ou WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { notify("A imagem deve ter no máximo 5 MB."); return; }
    if (avatarPreview.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    setSelectedAvatarAssetId(null);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };
  const saveProfile = async () => {
    if (!supabase || !session?.user.id) return;
    const cleanName = editName.trim();
    const cleanUsername = editUsername.trim().toLowerCase().replace(/^@/, "");
    if (cleanName.length < 2) { notify("Seu nome precisa ter pelo menos 2 caracteres."); return; }
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) { notify("Username: use 3 a 24 caracteres, letras, números ou _."); return; }
    if (editBio.length > 160) { notify("A bio pode ter no máximo 160 caracteres."); return; }
    setProfileSaving(true);
    try {
      let avatarUrl = profile?.avatar_url || null;
      if (avatarFile) {
        const ext = avatarFile.type === "image/png" ? "png" : avatarFile.type === "image/webp" ? "webp" : "jpg";
        const path = session.user.id + "/avatar-" + Date.now() + "." + ext;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true, contentType: avatarFile.type, cacheControl: "3600" });
        if (uploadError) throw uploadError;
        avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      } else if (selectedAvatarAssetId) {
        avatarUrl = null;
      }
      const { error } = await supabase.rpc("save_profile_customization", {
        p_display_name: cleanName,
        p_username: cleanUsername,
        p_bio: editBio.trim(),
        p_avatar_url: avatarUrl,
        p_avatar_asset_id: selectedAvatarAssetId,
        p_decoration_asset_id: selectedDecorationAssetId,
        p_banner_asset_id: selectedBannerAssetId
      });
      if (error) throw error;
      setProfile((current) => current ? { ...current, display_name: cleanName, username: cleanUsername, bio: editBio.trim(), avatar_url: avatarUrl } : current);
      setEquippedProfile({ user_id: session.user.id, avatar_asset_id: selectedAvatarAssetId, decoration_asset_id: selectedDecorationAssetId, banner_asset_id: selectedBannerAssetId });
      if (avatarPreview.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
      setEditProfileOpen(false);
      notify("Perfil atualizado com sucesso!");
    } catch (cause) {
      const detail = cause && typeof cause === "object" && "message" in cause
        ? String((cause as { message?: unknown }).message || "")
        : cause instanceof Error ? cause.message : "";
      const code = cause && typeof cause === "object" && "code" in cause
        ? String((cause as { code?: unknown }).code || "") : "";
      const msg = detail || "Não foi possível salvar seu perfil. Verifique sua conexão e tente novamente.";
      const friendly = code === "23505" || msg.includes("profiles_username_key") || msg.toLowerCase().includes("duplicate key")
        ? "Esse username já está em uso. Escolha outro."
        : code === "42501" || msg.toLowerCase().includes("permission denied")
          ? "O banco bloqueou a alteração por falta de permissão. Atualize o aplicativo e tente novamente."
          : msg;
      notify(friendly);
    } finally { setProfileSaving(false); }
  };
  const toggleProfileBadge = async (assetId:string) => {
    if (!supabase || !session?.user.id) return;
    const badge = profileBadges.find((item) => item.asset_id === assetId);
    if (!badge) { notify("Essa insígnia ainda está bloqueada."); return; }
    if (!badge.is_featured && profileBadges.filter((item) => item.is_featured).length >= 3) {
      notify("Você pode destacar até 3 insígnias no perfil.");
      return;
    }
    const { error } = await supabase.from("user_profile_badges").update({ is_featured: !badge.is_featured }).eq("user_id", session.user.id).eq("asset_id", assetId);
    if (error) { notify(error.message); return; }
    setProfileBadges((current) => current.map((item) => item.asset_id === assetId ? { ...item, is_featured: !item.is_featured } : item));
  };
  const signOut = async () => { if (supabase) { const { error } = await supabase.auth.signOut(); if (error) notify(error.message); else notify("Você saiu da sua conta."); } };
  const [dark, setDark] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [userLocation, setUserLocation] = useState<UserLocation|null>(null);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [stateInput, setStateInput] = useState("");
  const [cityFormOpen, setCityFormOpen] = useState(true);
  const [cityLookupLoading, setCityLookupLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState("Informe sua cidade e estado ou use o GPS.");

  useEffect(() => {
    const raw = window.localStorage.getItem("zorvi-map-region-v1");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { city?: string; state?: string; lat?: number; lon?: number };
      if (!saved.city || !saved.state) return;
      setCityInput(saved.city); setStateInput(saved.state);
      setSelectedCity(saved.city); setSelectedState(saved.state); setCityFormOpen(false);
      setLocationStatus("Região salva · " + saved.city + ", " + saved.state);
      if (Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) {
        setUserLocation({ lat: Number(saved.lat), lon: Number(saved.lon), accuracy: null, precision: "city" });
      } else {
        void geocodeCityCenter(saved.city, saved.state).then((point) => {
          if (!point) return;
          setUserLocation({ ...point, accuracy: null, precision: "city" });
          window.localStorage.setItem("zorvi-map-region-v1", JSON.stringify({ city: saved.city, state: saved.state, ...point }));
        }).catch(() => setLocationStatus("Região salva · " + saved.city + ", " + saved.state + ". O mapa usará os endereços cadastrados."));
      }
    } catch { window.localStorage.removeItem("zorvi-map-region-v1"); }
  }, []);

  const [manualLocationPicking, setManualLocationPicking] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeError, setStoreError] = useState("");
  const [priceResults, setPriceResults] = useState<PriceResult[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryResult[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [searchCandidates, setSearchCandidates] = useState<CatalogProduct[]>([]);
  const [selectedPriceProduct, setSelectedPriceProduct] = useState<CatalogProduct|null>(null);
  const [priceReportOpen, setPriceReportOpen] = useState(false);
  const [priceReportStoreId, setPriceReportStoreId] = useState("");
  const [priceReportValue, setPriceReportValue] = useState("");
  const [priceReportSourceUrl, setPriceReportSourceUrl] = useState("");
  const [priceReportAvailability, setPriceReportAvailability] = useState<"available"|"unavailable"|"unknown">("unknown");
  const [priceReportSubmitting, setPriceReportSubmitting] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [geocodingStores, setGeocodingStores] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [searchProductCategory, setSearchProductCategory] = useState<string|null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState("");
  const [mapBaseStyle, setMapBaseStyle] = useState<"loading"|"vector"|"fallback">("loading");
  const [mapInstanceKey, setMapInstanceKey] = useState(0);
  const [selectedMapStore, setSelectedMapStore] = useState<MapStore|null>(null);
  const [mapSheetExpanded, setMapSheetExpanded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement|null>(null);
  const leafletMapRef = useRef<LeafletMap|null>(null);
const leafletMarkerLayerRef = useRef<LeafletLayerGroup|null>(null);
const leafletUserLocationLayerRef = useRef<LeafletLayerGroup|null>(null);
  const manualLocationPickingRef = useRef(false);
  const autoGeocodeStartedRef = useRef(false);
  const [saved, setSaved] = useState<number[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [composer, setComposer] = useState(false);
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState("");
  const [postLocation, setPostLocation] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [postMenuId, setPostMenuId] = useState<string | null>(null);
  const [postToDelete, setPostToDelete] = useState<FeedPost | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);
  const [editPostText, setEditPostText] = useState("");
  const [editPostImage, setEditPostImage] = useState<File | null>(null);
  const [editPostImagePreview, setEditPostImagePreview] = useState("");
  const [editPostLocation, setEditPostLocation] = useState("");
  const [removeEditPostImage, setRemoveEditPostImage] = useState(false);
  const [savingPostEdit, setSavingPostEdit] = useState(false);
  const [commentsPost, setCommentsPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([{ role: "assistant", text: "Oi! ✨ Sou a ZORVI AI. Posso ajudar você a pesquisar produtos, comparar preços verificados e descobrir estabelecimentos. O que você está procurando?" }]);
  const [chatSending, setChatSending] = useState(false);
  const [chatMode, setChatMode] = useState<"idle"|"ai"|"catalog"|"error">("idle");
  const [toast, setToast] = useState("");
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(""), 2300); };
  const refreshMonitoring = useCallback(async (silent = false) => {
    if (!supabase || !session?.user.id) return;
    setMonitoringLoading(true);
    const { data, error } = await supabase.functions.invoke("zorvi-admin-monitor", { body: { action: "overview" } });
    if (error) {
      const status = Number((error as unknown as { context?: { status?: number } }).context?.status || 0);
      if (status === 401 || status === 403) {
        setIsZorviAdmin(false);
        setMonitoringData(null);
        setMonitoringError("");
      } else if (!silent) {
        setMonitoringError(error.message || "Não foi possível carregar o monitoramento.");
      }
      setMonitoringLoading(false);
      return;
    }
    setIsZorviAdmin(true);
    setMonitoringData(data as MonitoringDashboard);
    setMonitoringError("");
    setMonitoringLoading(false);
  }, [session?.user.id]);
  useEffect(() => {
    if (!session?.user.id) {
      setIsZorviAdmin(false);
      setMonitoringData(null);
      setMonitoringError("");
      return;
    }
    void refreshMonitoring(true);
  }, [session?.user.id, refreshMonitoring]);
  const send = async (value: string) => {
    const question = value.trim();
    if (!question || chatSending) return;
    const history = [
      ...chat.slice(-7).map((item) => ({ role: item.role, content: item.text })),
      { role: "user" as const, content: question },
    ];
    setChat((old) => [...old, { role: "user", text: question }]);
    setMessage("");

    if (!supabase || !session) {
      setChatMode("error");
      setChat((old) => [...old, { role: "assistant", text: "Entre na sua conta para consultar o catálogo e conversar com a ZORVI AI." }]);
      return;
    }

    setChatSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("zorvi-ai", {
        body: {
          messages: history,
          location: {
            city: selectedCity || null,
            state: selectedState || null,
            latitude: userLocation?.lat ?? null,
            longitude: userLocation?.lon ?? null,
            accuracy: userLocation?.accuracy ?? null,
            precision: userLocation?.precision ?? null,
          },
        },
      });
      if (error) {
        const context = (error as unknown as { context?: Response }).context;
        const payload = context && typeof context.clone === "function"
          ? await context.clone().json().catch(() => null)
          : null;
        throw new Error(payload?.error || error.message || "Não foi possível consultar a ZORVI AI.");
      }
      const answer = typeof data?.answer === "string" && data.answer.trim()
        ? data.answer.trim()
        : "Não consegui formular uma resposta agora. Tente novamente.";
      const results = Array.isArray(data?.results) ? data.results as ChatPriceResult[] : [];
      setChat((old) => [...old, { role: "assistant", text: answer, results }]);
      setChatMode(data?.mode === "ai" ? "ai" : "catalog");
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "Tente novamente em instantes.";
      setChatMode("error");
      setChat((old) => [...old, { role: "assistant", text: "Não consegui consultar o catálogo agora. " + detail }]);
    } finally {
      setChatSending(false);
    }
  };
  const loadFeed = async () => {
    if (!supabase || !session?.user.id) return;
    setFeedLoading(true);
    try {
      const { data: rows, error } = await supabase.from("posts").select("id,user_id,content,image_url,location_name,created_at").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      const raw = rows || [];
      const userIds = [...new Set(raw.map((row) => row.user_id))];
      const postIds = raw.map((row) => row.id);
      const [profileResult, likeResult, commentResult] = await Promise.all([
        userIds.length ? supabase.from("profiles").select("id,username,display_name,avatar_url,bio").in("id", userIds) : Promise.resolve({ data: [] as UserProfile[], error: null }),
        postIds.length ? supabase.from("post_likes").select("post_id,user_id").in("post_id", postIds) : Promise.resolve({ data: [] as {post_id:string;user_id:string}[], error: null }),
        postIds.length ? supabase.from("post_comments").select("post_id").in("post_id", postIds) : Promise.resolve({ data: [] as {post_id:string}[], error: null }),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (likeResult.error) throw likeResult.error;
      if (commentResult.error) throw commentResult.error;
      const profileMap = new Map((profileResult.data || []).map((item) => [item.id, item as UserProfile]));
      const likeRows = likeResult.data || [];
      const commentRows = commentResult.data || [];
      setPosts(raw.map((row) => ({ ...row, author: profileMap.get(row.user_id) || null, likes_count: likeRows.filter((x) => x.post_id === row.id).length, comments_count: commentRows.filter((x) => x.post_id === row.id).length, liked: likeRows.some((x) => x.post_id === row.id && x.user_id === session.user.id) })));
    } catch (cause) {
      notify(cause && typeof cause === "object" && "message" in cause ? String((cause as {message?:unknown}).message || "") : "Não foi possível carregar o feed.");
    } finally { setFeedLoading(false); }
  };
  useEffect(() => { if (session?.user.id) void loadFeed(); }, [session?.user.id]);
  const choosePostImage = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { notify("Use uma imagem JPG, PNG ou WebP."); return; }
    if (file.size > 8 * 1024 * 1024) { notify("A imagem deve ter no máximo 8 MB."); return; }
    setPostImage(file); setPostImagePreview(URL.createObjectURL(file));
  };
  const publish = async () => {
    if (!supabase || !session?.user.id || (!postText.trim() && !postImage)) return;
    setPublishing(true);
    try {
      let imageUrl: string | null = null;
      if (postImage) {
        const ext = postImage.type === "image/png" ? "png" : postImage.type === "image/webp" ? "webp" : "jpg";
        const path = session.user.id + "/" + Date.now() + "." + ext;
        const { error } = await supabase.storage.from("post-images").upload(path, postImage, { contentType: postImage.type, cacheControl: "3600" });
        if (error) throw error;
        imageUrl = supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("posts").insert({ user_id: session.user.id, content: postText.trim(), image_url: imageUrl, location_name: postLocation.trim() || null });
      if (error) throw error;
      setPostText(""); setPostImage(null); setPostImagePreview(""); setPostLocation(""); setComposer(false);
      await loadFeed(); setTab("home"); notify("Publicação compartilhada com a comunidade!");
    } catch (cause) {
      notify(cause && typeof cause === "object" && "message" in cause ? String((cause as {message?:unknown}).message || "") : "Não foi possível publicar.");
    } finally { setPublishing(false); }
  };
  const toggleLike = async (post: FeedPost) => {
    if (!supabase || !session?.user.id) return;
    setPosts((old) => old.map((item) => item.id === post.id ? { ...item, liked: !post.liked, likes_count: item.likes_count + (post.liked ? -1 : 1) } : item));
    const result = post.liked ? await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", session.user.id) : await supabase.from("post_likes").insert({ post_id: post.id, user_id: session.user.id });
    if (result.error) { notify(result.error.message); await loadFeed(); }
  };
  const openEditPost = (post: FeedPost) => {
    if (post.user_id !== session?.user.id) { notify("Você só pode editar suas próprias publicações."); return; }
    setPostMenuId(null);
    setEditingPost(post);
    setEditPostText(post.content || "");
    setEditPostImage(null);
    setEditPostImagePreview(post.image_url || "");
    setEditPostLocation(post.location_name || "");
    setRemoveEditPostImage(false);
  };
  const chooseEditPostImage = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { notify("Use uma imagem JPG, PNG ou WebP."); return; }
    if (file.size > 8 * 1024 * 1024) { notify("A imagem deve ter no máximo 8 MB."); return; }
    if (editPostImagePreview.startsWith("blob:")) URL.revokeObjectURL(editPostImagePreview);
    setEditPostImage(file);
    setEditPostImagePreview(URL.createObjectURL(file));
    setRemoveEditPostImage(false);
  };
  const closeEditPost = () => {
    if (savingPostEdit) return;
    if (editPostImagePreview.startsWith("blob:")) URL.revokeObjectURL(editPostImagePreview);
    setEditingPost(null); setEditPostText(""); setEditPostImage(null); setEditPostImagePreview(""); setEditPostLocation(""); setRemoveEditPostImage(false);
  };
  const savePostEdit = async () => {
    const post = editingPost;
    if (!supabase || !session?.user.id || !post) return;
    if (post.user_id !== session.user.id) { notify("Você só pode editar suas próprias publicações."); closeEditPost(); return; }
    if (!editPostText.trim() && !editPostImagePreview) { notify("Adicione um texto ou uma foto à publicação."); return; }
    setSavingPostEdit(true);
    let uploadedPath: string | null = null;
    try {
      let imageUrl = removeEditPostImage ? null : post.image_url;
      if (editPostImage) {
        const ext = editPostImage.type === "image/png" ? "png" : editPostImage.type === "image/webp" ? "webp" : "jpg";
        uploadedPath = session.user.id + "/" + Date.now() + "." + ext;
        const { error: uploadError } = await supabase.storage.from("post-images").upload(uploadedPath, editPostImage, { contentType: editPostImage.type, cacheControl: "3600" });
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from("post-images").getPublicUrl(uploadedPath).data.publicUrl;
      }
      const nextContent = editPostText.trim();
      const nextLocation = editPostLocation.trim() || null;
      const { data: updatedPost, error } = await supabase.from("posts").update({ content: nextContent, image_url: imageUrl, location_name: nextLocation }).eq("id", post.id).eq("user_id", session.user.id).select("id").maybeSingle();
      if (error) throw error;
      if (!updatedPost) throw new Error("Não foi possível localizar a publicação para atualizar.");
      setPosts((old) => old.map((item) => item.id === post.id ? { ...item, content: nextContent, image_url: imageUrl, location_name: nextLocation } : item));
      if (commentsPost?.id === post.id) setCommentsPost((old) => old ? { ...old, content: nextContent, image_url: imageUrl, location_name: nextLocation } : old);
      const oldImageUrl = post.image_url;
      if (oldImageUrl && oldImageUrl !== imageUrl) {
        try {
          const marker = "/storage/v1/object/public/post-images/";
          const pathname = new URL(oldImageUrl).pathname;
          const markerIndex = pathname.indexOf(marker);
          if (markerIndex >= 0) {
            const oldPath = decodeURIComponent(pathname.slice(markerIndex + marker.length));
            if (oldPath) await supabase.storage.from("post-images").remove([oldPath]);
          }
        } catch { /* The post is saved; a stale old image can be cleaned up later. */ }
      }
      if (editPostImagePreview.startsWith("blob:")) URL.revokeObjectURL(editPostImagePreview);
      setEditingPost(null); setEditPostText(""); setEditPostImage(null); setEditPostImagePreview(""); setEditPostLocation(""); setRemoveEditPostImage(false);
      notify("Publicação atualizada com sucesso!");
    } catch (cause) {
      if (uploadedPath) { try { await supabase.storage.from("post-images").remove([uploadedPath]); } catch { /* Keep the original post unchanged if cleanup fails. */ } }
      notify(cause && typeof cause === "object" && "message" in cause ? String((cause as {message?:unknown}).message || "") : "Não foi possível salvar as alterações.");
    } finally { setSavingPostEdit(false); }
  };
  const deletePost = async () => {
    const post = postToDelete;
    if (!supabase || !session?.user.id || !post) return;
    if (post.user_id !== session.user.id) { notify("Você só pode excluir suas próprias publicações."); setPostToDelete(null); return; }
    setDeletingPostId(post.id);
    try {
      const { error } = await supabase.from("posts").delete().eq("id", post.id).eq("user_id", session.user.id);
      if (error) throw error;
      setPosts((old) => old.filter((item) => item.id !== post.id));
      if (commentsPost?.id === post.id) { setCommentsPost(null); setComments([]); }
      setPostToDelete(null);
      let imageCleanupFailed = false;
      if (post.image_url) {
        try {
          const marker = "/storage/v1/object/public/post-images/";
          const pathname = new URL(post.image_url).pathname;
          const markerIndex = pathname.indexOf(marker);
          if (markerIndex >= 0) {
            const objectPath = decodeURIComponent(pathname.slice(markerIndex + marker.length));
            if (objectPath) {
              const { error: storageError } = await supabase.storage.from("post-images").remove([objectPath]);
              if (storageError) imageCleanupFailed = true;
            }
          }
        } catch { imageCleanupFailed = true; }
      }
      notify(imageCleanupFailed ? "Publicação excluída. Não foi possível remover a foto do armazenamento." : "Publicação excluída com sucesso!");
    } catch (cause) {
      notify(cause && typeof cause === "object" && "message" in cause ? String((cause as {message?:unknown}).message || "") : "Não foi possível excluir a publicação.");
    } finally { setDeletingPostId(null); }
  };
  const openComments = async (post: FeedPost) => {
    if (!supabase) return;
    setCommentsPost(post); setComments([]); setCommentsLoading(true);
    const { data, error } = await supabase.from("post_comments").select("id,content,created_at,user_id").eq("post_id", post.id).order("created_at", { ascending: true });
    if (error) { notify(error.message); setCommentsLoading(false); return; }
    const ids = [...new Set((data || []).map((item) => item.user_id))];
    const { data: authors, error: authorError } = ids.length ? await supabase.from("profiles").select("id,username,display_name,avatar_url,bio").in("id", ids) : { data: [] as UserProfile[], error: null };
    if (authorError) notify(authorError.message);
    const map = new Map((authors || []).map((item) => [item.id, item as UserProfile]));
    setComments((data || []).map((item) => ({ ...item, author: map.get(item.user_id) || null })));
    setCommentsLoading(false);
  };
  const sendComment = async () => {
    if (!supabase || !session?.user.id || !commentsPost || !commentText.trim()) return;
    setCommentSending(true);
    const { error } = await supabase.from("post_comments").insert({ post_id: commentsPost.id, user_id: session.user.id, content: commentText.trim() });
    if (error) notify(error.message);
    else { setCommentText(""); await openComments(commentsPost); await loadFeed(); }
    setCommentSending(false);
  };
  const requestLocation = useCallback(() => {
    manualLocationPickingRef.current = false;
    setManualLocationPicking(false);
    if (!navigator.geolocation) {
      if (!selectedCity) setUserLocation(null);
      setLocationStatus("Este navegador não oferece localização. Escolha um ponto manualmente no mapa.");
      return;
    }
    setLocationStatus("Buscando sua localização...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const accuracy = Number(coords.accuracy);
        const latitude = Number(coords.latitude);
        const longitude = Number(coords.longitude);
        const validCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
          && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
        if (!validCoordinates || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 5000) {
          const accuracyLabel = Number.isFinite(accuracy) ? `±${Math.round(accuracy)} m` : "indefinida";
          if (!selectedCity) setUserLocation(null);
          setLocationStatus(`O GPS retornou uma posição muito imprecisa (${accuracyLabel}). Tente novamente ou escolha um ponto no mapa.`);
          return;
        }
        const precision = accuracy <= 100 ? "precise" : "approximate";
        setSelectedCity(""); setSelectedState(""); setCityFormOpen(false);
        window.localStorage.removeItem("zorvi-map-region-v1");
        setUserLocation({ lat: latitude, lon: longitude, accuracy, precision });
        setLocationStatus(
          precision === "precise"
            ? `GPS confirmado · precisão de ±${Math.round(accuracy)} m`
            : `Localização aproximada · margem de erro de ±${Math.round(accuracy)} m. Distâncias estimadas.`
        );
      },
      (error) => {
        if (!selectedCity) setUserLocation(null);
        setLocationStatus(
          error.code === error.PERMISSION_DENIED
            ? "Permissão negada. Libere a localização no navegador ou escolha um ponto no mapa."
            : error.code === error.POSITION_UNAVAILABLE
              ? "O dispositivo não conseguiu determinar sua posição. Verifique o GPS ou escolha um ponto no mapa."
              : "O GPS demorou para responder. Tente novamente ou escolha um ponto no mapa."
        );
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
    );
  }, [selectedCity]);

  const loadNearbyStores = useCallback(async () => {
    if (!supabase) return;
    setCatalogLoading(true);
    try {
      const allStores: Store[] = [];
      const pageSize = 500;
      for (let offset = 0; offset < 50000; offset += pageSize) {
        let pageQuery = supabase
          .from("stores")
          .select("id,name,category,address,city,state,latitude,longitude,website_url,brand_name,brand_slug,brand_logo_url,coordinate_precision,coordinate_source,geocoded_at,geocode_attempted_at,google_place_id,google_match_status,google_checked_at,google_verified_at,source_url,source_label,osm_type,osm_id,osm_last_seen_at")
          .eq("verification_status", "verified");
        if (selectedCity) pageQuery = pageQuery.eq("city", selectedCity);
        if (selectedState) pageQuery = pageQuery.eq("state", selectedState);
        const { data, error } = await pageQuery
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const page = (data || []) as Store[];
        allStores.push(...page);
        if (page.length < pageSize) break;
      }
      setStores(allStores);
      setStoreError("");
    } catch (error) {
      setStoreError(
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message || "")
          : "Não foi possível carregar os estabelecimentos."
      );
    } finally {
      setCatalogLoading(false);
    }
  }, [selectedCity, selectedState]);

  useEffect(() => {
    if (tab === "map") void loadNearbyStores();
  }, [tab, loadNearbyStores]);


  const saveCityRegion = async () => {
    const city = cityInput.trim().replace(/\s+/g, " ");
    const stateCode = stateInput.trim().toUpperCase();
    if (city.length < 2 || !BRAZIL_STATE_NAMES[stateCode]) { notify("Informe uma cidade e selecione um estado válido."); return; }
    setCityLookupLoading(true); setSelectedCity(city); setSelectedState(stateCode);
    setLocationStatus("Localizando " + city + ", " + stateCode + "...");
    setSearchPerformed(false); setPriceResults([]); setSelectedMapStore(null);
    let point: { lat: number; lon: number } | null = null;
    try { point = await geocodeCityCenter(city, stateCode); } catch { point = null; }
    if (point) setUserLocation({ ...point, accuracy: null, precision: "city" });
    else {
      const localStores = stores.filter((store) => storeMatchesRegion(store, city, stateCode) && store.latitude !== null && store.longitude !== null);
      if (localStores.length) {
        point = {
          lat: localStores.reduce((sum, store) => sum + Number(store.latitude), 0) / localStores.length,
          lon: localStores.reduce((sum, store) => sum + Number(store.longitude), 0) / localStores.length,
        };
        setUserLocation({ ...point, accuracy: null, precision: "city" });
      } else setUserLocation(null);
    }
    window.localStorage.setItem("zorvi-map-region-v1", JSON.stringify({ city, state: stateCode, ...(point || {}) }));
    setCityFormOpen(false);
    setLocationStatus(point ? "Centro urbano aproximado · " + city + ", " + stateCode : "Região selecionada · " + city + ", " + stateCode + ". Aguardando coordenadas dos estabelecimentos.");
    await loadNearbyStores();
    setCityLookupLoading(false);
  };


  const nearbyStores = useMemo(
    () => stores
      .filter((store) => store.coordinate_source !== "online_catalog")
      .filter((store) => filter === "Todos" || store.category === filter)
      .filter((store) => !selectedCity || storeMatchesRegion(store, selectedCity, selectedState))
      .map((store) => ({
        ...store,
        distance: userLocation && store.latitude !== null && store.longitude !== null
          ? distanceKm(userLocation.lat, userLocation.lon, store.latitude, store.longitude)
          : null,
      }))
      .filter((store) => {
        if (selectedCity) return true;
        if (userLocation) return store.distance !== null && store.distance <= 20;
        return true;
      })
      .sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999)),
    [stores, filter, userLocation, selectedCity, selectedState]
  );

  const mapStores = useMemo<MapStore[]>(() => {
    const relevantStores = nearbyStores.filter(store => !searchPerformed || !searchProductCategory || store.category === searchProductCategory);
    if (!searchPerformed) return relevantStores;
    const bestByStore = new Map<string,PriceResult>();
    priceResults.forEach(result => {
      if (result.is_stale) return;
      const current = bestByStore.get(result.store.id);
      if (!current || Number(result.price) < Number(current.price)) bestByStore.set(result.store.id,result);
    });
    return relevantStores.map(store => {
      const result = bestByStore.get(store.id);
      return {
        ...store,
mapPrice: result ? Number(result.price) : null,
        mapPriceType: result?.price_type || null,
        mapPriceObservedAt: result?.observed_at || null,
        mapPriceSource: result?.source_label || null,
        mapProductLabel: result ? [result.product.name,result.product.variant].filter(Boolean).join(" · ") : null,
      };
    });
  },[nearbyStores,searchPerformed,searchProductCategory,priceResults]);

  const bestMapPrice = useMemo(() => {
    const prices = mapStores.map(store => store.mapPrice).filter((price): price is number => typeof price === "number" && Number.isFinite(price));
    return prices.length ? Math.min(...prices) : null;
  }, [mapStores]);
  const comparisonStats = useMemo(() => {
    const fresh = priceResults.filter((result) => !result.is_stale).sort((a, b) => Number(a.price) - Number(b.price));
    if (!fresh.length) return { freshCount: 0, cheapest: null as PriceResult|null, highest: null as PriceResult|null, savings: 0, savingsPercent: 0 };
    const cheapest = fresh[0];
    const highest = fresh[fresh.length - 1];
    const savings = Math.max(0, Number(highest.price) - Number(cheapest.price));
    return { freshCount: fresh.length, cheapest, highest, savings, savingsPercent: Number(highest.price) > 0 ? savings / Number(highest.price) * 100 : 0 };
  }, [priceResults]);
  const mapLocatedCount = mapStores.filter(store => store.latitude !== null && store.longitude !== null).length;
  const mapPendingCount = mapStores.length - mapLocatedCount;
  const mapGoogleVerifiedCount = mapStores.filter(store => store.google_match_status === "verified").length;
  const mapGooglePendingCount = mapStores.length - mapGoogleVerifiedCount;

  const geocodeStores = useCallback(async (silent = false, mode: "missing" | "verify" = "missing") => {
    if (!supabase || geocodingStores) return;
    setGeocodingStores(true);
    try {
      let totalUpdated = 0;
      let totalProcessed = 0;
      let totalNotLocated = 0;
      let totalVerified = 0;
      let totalReviewRequired = 0;
      let totalNotFound = 0;
      let totalFailed = 0;
      let previousRemaining = Number.POSITIVE_INFINITY;

      // Processa cinco estabelecimentos por chamada para respeitar os limites das APIs.
      for (let round = 0; round < 10; round += 1) {
        const { data, error } = await supabase.functions.invoke("geocode-stores", {
          body: { category: filter === "Todos" ? null : filter, mode },
        });
        if (error) {
          let detail = error.message || "Não foi possível localizar as lojas.";
          const context = (error as unknown as { context?: Response }).context;
          if (context && typeof context.clone === "function") {
            const payload = await context.clone().json().catch(() => null);
            detail = payload?.details || payload?.error || detail;
          }
          throw new Error(detail);
        }

        const processed = Number(data?.processed || 0);
        const remaining = Number(data?.remaining || 0);
        totalProcessed += processed;
        totalUpdated += Number(data?.updated || 0);
        totalVerified += Number(data?.verified || 0);
        totalReviewRequired += Array.isArray(data?.reviewRequired) ? data.reviewRequired.length : 0;
        totalNotFound += Array.isArray(data?.notFound) ? data.notFound.length : 0;
        totalNotLocated += Array.isArray(data?.notLocated) ? data.notLocated.length : 0;
        totalFailed += Array.isArray(data?.failed) ? data.failed.length : 0;

        if (processed === 0 || remaining === 0 || remaining >= previousRemaining) break;
        previousRemaining = remaining;
      }

      await loadNearbyStores();
      if (!silent) {
        if (mode === "verify") {
          notify(`Google Maps: ${totalVerified} vínculos criados, ${totalReviewRequired} para revisão, ${totalNotFound} sem correspondência e ${totalFailed} falhas.`);
        } else if (totalUpdated > 0) {
          notify(`${totalUpdated} lojas receberam coordenadas. ${totalNotLocated} sem correspondência e ${totalFailed} falhas temporárias.`);
        } else {
          notify(`Foram verificadas ${totalProcessed} lojas. Nenhuma coordenada foi confirmada; ${totalNotLocated} sem correspondência e ${totalFailed} falhas temporárias.`);
        }
      }
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "Não foi possível localizar as lojas agora.";
      if (silent) setStoreError(message);
      else notify(message);
    } finally {
      setGeocodingStores(false);
    }
  }, [filter, geocodingStores, loadNearbyStores]);

  useEffect(() => {
    if (tab !== "map" || catalogLoading || stores.length === 0 || geocodingStores || autoGeocodeStartedRef.current) return;
    const hasPendingCoordinates = stores.some((store) => store.coordinate_source !== "online_catalog" && (store.latitude === null || store.longitude === null));
    if (!hasPendingCoordinates) return;
    autoGeocodeStartedRef.current = true;
    void geocodeStores(true);
  }, [tab, catalogLoading, stores, geocodingStores, geocodeStores]);

  const loadPricesForProduct = async (product: CatalogProduct) => {
    if (!supabase) throw new Error("Supabase não está configurado.");
    setSelectedPriceProduct(product);
    setSearchCandidates([]);
    setSearchProductCategory(product.category);
    setHistoryExpanded(false);
    if (product.category) setFilter(product.category);

    const [comparisonResult, historyResult] = await Promise.all([
      supabase.from("product_price_comparison").select("*")
        .eq("product_id", product.id)
        .order("is_stale", { ascending: true })
        .order("price", { ascending: true })
        .limit(100),
      supabase.from("product_price_history").select("id,product_id,store_id,price,price_type,source_label,observed_at,store_name,store_city,store_state,is_online")
        .eq("product_id", product.id)
        .gte("observed_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .order("observed_at", { ascending: false })
        .limit(100)
    ]);
    if (comparisonResult.error) throw comparisonResult.error;
    if (historyResult.error) throw historyResult.error;

    const verifiedRows = ((comparisonResult.data || []) as Record<string, unknown>[]).map((row): PriceResult => ({
      id: String(row.id),
      price: Number(row.price),
      price_type: String(row.price_type),
      source_url: row.source_url ? String(row.source_url) : null,
      source_label: String(row.source_label || ""),
      observed_at: String(row.observed_at),
      availability_status: String(row.availability_status || "unknown"),
      is_online: Boolean(row.is_online),
      is_stale: Boolean(row.is_stale),
      age_hours: Number(row.age_hours || 0),
      store: {
        id: String(row.store_id),
        name: String(row.store_name || ""),
        category: String(row.store_category || ""),
        address: String(row.store_address || ""),
        city: String(row.store_city || ""),
        state: String(row.store_state || ""),
        latitude: row.store_latitude === null ? null : Number(row.store_latitude),
        longitude: row.store_longitude === null ? null : Number(row.store_longitude),
        website_url: row.store_website_url ? String(row.store_website_url) : null,
        brand_name: row.store_brand_name ? String(row.store_brand_name) : null,
        brand_slug: row.store_brand_slug ? String(row.store_brand_slug) : null,
        brand_logo_url: row.store_brand_logo_url ? String(row.store_brand_logo_url) : null,
        coordinate_precision: row.store_coordinate_precision ? String(row.store_coordinate_precision) : null,
        coordinate_source: row.store_coordinate_source ? String(row.store_coordinate_source) : null,
        geocoded_at: row.store_geocoded_at ? String(row.store_geocoded_at) : null,
        geocode_attempted_at: row.store_geocode_attempted_at ? String(row.store_geocode_attempted_at) : null,
        google_place_id: row.store_google_place_id ? String(row.store_google_place_id) : null,
        google_match_status: row.store_google_match_status ? String(row.store_google_match_status) : null,
        google_checked_at: row.store_google_checked_at ? String(row.store_google_checked_at) : null,
        google_verified_at: row.store_google_verified_at ? String(row.store_google_verified_at) : null
      },
      product: { id: product.id, name: product.name, brand: product.brand, variant: product.variant, unit: product.unit, category: product.category }
    })).filter((row) =>
      row.store.category === product.category
      && (!selectedCity || storeMatchesRegion(row.store, selectedCity, selectedState))
      && (!userLocation || row.store.latitude === null || row.store.longitude === null || distanceKm(
        userLocation.lat, userLocation.lon, row.store.latitude, row.store.longitude
      ) <= 20 || userLocation.precision === "city")
    );
    verifiedRows.sort((a, b) => Number(a.is_stale) - Number(b.is_stale) || Number(a.price) - Number(b.price));
    const visibleStoreIds = new Set(verifiedRows.map((row) => row.store.id));
    const historyRows = ((historyResult.data || []) as PriceHistoryResult[]).filter((row) => visibleStoreIds.has(row.store_id));
    setPriceResults(verifiedRows);
    setPriceHistory(historyRows);
  };

  const choosePriceProduct = async (product: CatalogProduct) => {
    setCatalogLoading(true);
    try {
      await loadPricesForProduct(product);
    } catch (error) {
      setPriceResults([]);
      notify(error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "Erro ao consultar preços deste produto.");
    } finally {
      setCatalogLoading(false);
    }
  };

  const searchPrices = async () => {
    if (!supabase || !query.trim()) return;
    setCatalogLoading(true);
    setSearchPerformed(true);
    setPriceResults([]);
    setSearchCandidates([]);
    setSelectedPriceProduct(null);
    setSearchProductCategory(null);
    try {
      const barcode = query.trim().replace(/\D/g, "");
      const isBarcode = /^\d{8,14}$/.test(barcode);
      const { data, error } = isBarcode
        ? await supabase.from("products")
          .select("id,name,normalized_name,brand,variant,unit,category")
          .eq("barcode", barcode)
          .eq("is_active", true)
          .limit(10)
        : await supabase.rpc("search_product_catalog", {
          search_query: query.trim(),
          result_limit: 12,
        });
      if (error) throw error;

      const uniqueProducts = Array.from(new Map<string, CatalogProduct>(
        ((data || []) as CatalogProduct[]).map((product): [string, CatalogProduct] => [product.id, product])
      ).values());
      if (!uniqueProducts.length) {
        setSearchProductCategory(null);
        notify("Não encontrei esse produto no catálogo. Tente informar marca, tamanho, quantidade ou código de barras.");
        return;
      }

      if (uniqueProducts.length === 1) {
        await loadPricesForProduct(uniqueProducts[0]);
        return;
      }

      setSearchCandidates(uniqueProducts.slice(0, 10));
      setSearchProductCategory(null);
      setPriceResults([]);
    } catch (error) {
      setPriceResults([]);
      setSearchCandidates([]);
      setSelectedPriceProduct(null);
      setSearchPerformed(false);
      notify(
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message || "")
          : "Erro ao comparar preços."
      );
    } finally {
      setCatalogLoading(false);
    }
  };

  const openPriceReport = (storeId?: string) => {
    if (!session?.user.id) {
      notify("Entre na sua conta para informar um preço.");
      return;
    }
    if (!selectedPriceProduct) {
      notify("Pesquise e selecione um produto primeiro.");
      return;
    }
    const availableStores = (mapStores.length ? mapStores : nearbyStores)
      .filter((store) => store.category === selectedPriceProduct.category);
    if (!availableStores.length) {
      notify("Não há estabelecimentos desta categoria cadastrados nesta região.");
      return;
    }
    const preferredStoreId = storeId && availableStores.some((store) => store.id === storeId)
      ? storeId
      : selectedMapStore && availableStores.some((store) => store.id === selectedMapStore.id)
        ? selectedMapStore.id
        : availableStores[0].id;
    setPriceReportStoreId(preferredStoreId);
    setPriceReportValue("");
    setPriceReportSourceUrl("");
    setPriceReportAvailability("unknown");
    setPriceReportOpen(true);
  };

  const submitPriceReport = async () => {
    if (!supabase || !session?.user.id || !selectedPriceProduct) {
      notify("Sua sessão expirou. Entre novamente para enviar o preço.");
      return;
    }
    const numericPrice = Number(priceReportValue.trim().replace(",", "."));
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      notify("Informe um preço válido, maior que zero.");
      return;
    }
    if (!priceReportStoreId) {
      notify("Selecione o estabelecimento.");
      return;
    }
    const sourceUrl = priceReportSourceUrl.trim();
    if (sourceUrl && !/^https?:\/\/\S+$/i.test(sourceUrl)) {
      notify("O link precisa começar com http:// ou https://.");
      return;
    }

    setPriceReportSubmitting(true);
    try {
      const { error } = await supabase.from("price_observations").insert({
        product_id: selectedPriceProduct.id,
        store_id: priceReportStoreId,
        price: numericPrice,
        currency: "BRL",
        price_type: "community_report",
        source_url: sourceUrl || null,
        source_label: sourceUrl
          ? "Relato da comunidade com link de apoio · aguardando validação"
          : "Relato da comunidade · aguardando validação",
        availability_status: priceReportAvailability,
        verification_status: "pending",
        confidence_score: 0.5,
        submitted_by: session.user.id,
      });
      if (error) throw error;
      setPriceReportOpen(false);
      notify("Preço enviado para validação. Ele não aparecerá como confirmado antes da revisão.");
    } catch (error) {
      notify(error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "Não foi possível enviar o preço agora.");
    } finally {
      setPriceReportSubmitting(false);
    }
  };

  useEffect(() => {
    if (tab !== "map") return;
    let active = true;
    let mapStyleFallbackTimer: number | undefined;
    setMapLoadError("");
    setMapBaseStyle("loading");
    void ensureLeaflet().then((leaflet) => {
      if (!active || !mapContainerRef.current) return;
      if (!leafletMapRef.current) {
        const map = leaflet.map(mapContainerRef.current, { zoomControl: true, scrollWheelZoom: false });
        map.setView([-14.2350, -51.9253], 4.5);
        map.on("click", (event) => {
          if (!manualLocationPickingRef.current) return;
          const latitude = Number(event.latlng.lat);
          const longitude = Number(event.latlng.lng);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
          setSelectedCity(""); setSelectedState(""); setCityFormOpen(false);
          window.localStorage.removeItem("zorvi-map-region-v1");
          setUserLocation({ lat: latitude, lon: longitude, accuracy: null, precision: "manual" });
          setLocationStatus("Ponto escolhido manualmente no mapa · não é uma posição GPS.");
          manualLocationPickingRef.current = false;
          setManualLocationPicking(false);
        });
        const fallbackTiles = leaflet.tileLayer(MAP_FALLBACK_TILE_URL, {
          maxZoom: 19,
          attribution: MAP_FALLBACK_ATTRIBUTION,
          className: "zorvi-fallback-tiles",
        }).addTo(map);

        if (leaflet.maplibreGL) {
          try {
            const vectorLayer = leaflet.maplibreGL({
              style: MAP_STYLE_URL,
              attributionControl: { compact: false },
              interactive: false,
              maxPitch: 0,
            }).addTo(map);
            const vectorMap = vectorLayer.getMaplibreMap();
            let styleSettled = false;
            const settleMapStyle = (useVector: boolean) => {
              if (styleSettled || !active) return;
              styleSettled = true;
              if (mapStyleFallbackTimer !== undefined) window.clearTimeout(mapStyleFallbackTimer);
              if (useVector) {
                fallbackTiles.remove();
                setMapBaseStyle("vector");
              } else {
                vectorLayer.remove();
                setMapBaseStyle("fallback");
              }
            };
            vectorMap.on("load", () => {
              try {
                applyZorviMapPalette(vectorMap);
              } catch (paletteError) {
                console.warn("[ZORVI] Não foi possível aplicar toda a paleta cartográfica da marca.", paletteError);
              }
              settleMapStyle(true);
            });
            // A single failed glyph/tile request must not discard an otherwise healthy vector map.
            vectorMap.on("error", (event) => {
              console.warn("[ZORVI] Erro pontual ao carregar recurso cartográfico vetorial.", event);
            });
            mapStyleFallbackTimer = window.setTimeout(() => settleMapStyle(false), 15000);
          } catch (error) {
            console.warn("[ZORVI] Não foi possível ativar a base vetorial; mantendo o mapa alternativo.", error);
            setMapBaseStyle("fallback");
          }
        } else {
          console.warn("[ZORVI] Plugin MapLibre GL Leaflet não foi carregado; usando a base alternativa.");
          setMapBaseStyle("fallback");
        }

        leafletMapRef.current = map;
        const clusterOptions = {
          maxClusterRadius: 46,
          disableClusteringAtZoom: 16,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          chunkedLoading: true,
          iconCreateFunction: (cluster: { getChildCount(): number }) => {
            const count = cluster.getChildCount();
            const size = count >= 100 ? 42 : count >= 10 ? 38 : 34;
            return leaflet.divIcon({
              className: "zorvi-marker-cluster",
              html: `<span class="zorvi-marker-cluster-count" role="img" aria-label="${count} estabelecimentos">${count}</span>`,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            });
          },
        };
        leafletMarkerLayerRef.current = (
          leaflet.markerClusterGroup
            ? leaflet.markerClusterGroup(clusterOptions)
            : leaflet.layerGroup()
        ).addTo(map);
        // Keep the user's GPS/city marker out of the business cluster.
        leafletUserLocationLayerRef.current = leaflet.layerGroup().addTo(map);
      }
      setMapReady(true);
      window.setTimeout(() => leafletMapRef.current?.invalidateSize(), 120);
    }).catch((error:unknown) => {
      if (active) setMapLoadError(error instanceof Error ? error.message : "Não foi possível carregar o mapa.");
    });
    return () => {
      active = false;
      if (mapStyleFallbackTimer !== undefined) window.clearTimeout(mapStyleFallbackTimer);
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      leafletMarkerLayerRef.current = null;
      leafletUserLocationLayerRef.current = null;
      setMapReady(false);
      setSelectedMapStore(null);
    };
  }, [tab, mapInstanceKey]);

  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;
    const map = leafletMapRef.current;
    if (userLocation) {
      const zoom = userLocation.precision === "city" ? 12
        : userLocation.precision === "approximate" && (userLocation.accuracy || 0) > 1000 ? 12
          : userLocation.precision === "approximate" ? 14 : 15;
      map.setView([userLocation.lat, userLocation.lon], zoom);
    } else if (selectedCity) {
      const cityStores = stores.filter((store) => storeMatchesRegion(store, selectedCity, selectedState) && store.latitude !== null && store.longitude !== null);
      if (cityStores.length > 1) map.fitBounds(cityStores.map((store) => [store.latitude as number, store.longitude as number]), { padding: [28, 28], maxZoom: 13 });
      else if (cityStores.length === 1) map.setView([cityStores[0].latitude as number, cityStores[0].longitude as number], 13);
      else map.setView([-14.2350, -51.9253], 4.5);
    } else map.setView([-14.2350, -51.9253], 4.5);
  }, [mapReady, userLocation, selectedCity, selectedState, stores]);

  useEffect(() => {
    const leaflet = window.L;
    const markerLayer = leafletMarkerLayerRef.current;
    const userLocationLayer = leafletUserLocationLayerRef.current;
    if (!mapReady || !leaflet || !markerLayer || !userLocationLayer) return;
    markerLayer.clearLayers();
    userLocationLayer.clearLayers();

    mapStores.forEach((store) => {
      if (store.latitude === null || store.longitude === null) return;
      const brand = getStoreBrand(store);
      const hasPrice = typeof store.mapPrice === "number";
      const logoUrl = getStoreBrandLogo(store);
      const logoMarkup = logoUrl
        ? `<img src="${escapeMapHtml(logoUrl)}" alt="${escapeMapHtml(brand.name)}" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()" />`
        : "";
      const selectedClass = selectedMapStore?.id === store.id ? " is-selected" : "";
      const markerHtml = `<div class="zorvi-map-marker${searchPerformed ? " with-price" : ""}${selectedClass}" style="--brand-accent:${brand.color}">
        <span class="zorvi-map-marker-symbol"><b>${escapeMapHtml(brand.initials)}</b>${logoMarkup}</span>
        ${searchPerformed ? `<span class="zorvi-map-marker-price ${hasPrice ? "is-price" : "no-price"}">${hasPrice ? `${store.mapPriceType === "estimated" ? "≈ " : ""}${formatMapPrice(store.mapPrice as number)}` : "Sem preço"}</span>` : ""}
      </div>`;
      const icon = leaflet.divIcon({
        className: "zorvi-leaflet-icon",
        html: markerHtml,
        iconSize: searchPerformed ? [116, 40] : [38, 40],
        iconAnchor: searchPerformed ? [18, 20] : [19, 38],
        popupAnchor: [0, searchPerformed ? -22 : -35],
      });
      const marker = leaflet.marker([store.latitude, store.longitude], { icon, zIndexOffset: 500 }).addTo(markerLayer);
      const priceMarkup = hasPrice
        ? `<strong class="zorvi-popup-price">${getMapPriceLabel(store.mapPriceType)} · ${formatMapPrice(store.mapPrice as number)}</strong><small>${escapeMapHtml(store.mapProductLabel || query)}</small>`
        : searchPerformed ? '<strong class="zorvi-popup-no-price">Preço não confirmado</strong>' : "";
      const coordinateMarkup = store.google_match_status === "verified"
        ? "<small>Referência do Google Maps vinculada</small>"
        : store.coordinate_precision === "street" ? "<small>Localização aproximada na via</small>" : store.coordinate_precision === "address" ? "<small>Endereço geocodificado</small>" : "";
      const updatedMarkup = store.mapPriceObservedAt
        ? `<small>Atualizado em ${escapeMapHtml(new Date(store.mapPriceObservedAt).toLocaleString("pt-BR"))}</small>`
        : "";
      const popupHtml = `<div class="zorvi-map-popup"><b>${escapeMapHtml(store.name)}</b><small>${escapeMapHtml(store.address)}, ${escapeMapHtml(store.city)}</small>${priceMarkup}${coordinateMarkup}${updatedMarkup}${store.website_url ? `<a href="${escapeMapHtml(store.website_url)}" target="_blank" rel="noreferrer">Site da loja</a>` : ""}</div>`;
      marker.bindPopup(popupHtml);
      marker.on("click", () => { setSelectedMapStore(store); setMapSheetExpanded(true); });
    });

    const map = leafletMapRef.current;
    const positionedStores = mapStores.filter((store) => store.latitude !== null && store.longitude !== null);
    if (map && !userLocation && !selectedMapStore && positionedStores.length > 1) {
      map.fitBounds(positionedStores.map((store) => [store.latitude as number, store.longitude as number]), { padding: [28, 28], maxZoom: 14 });
    } else if (map && !userLocation && !selectedMapStore && positionedStores.length === 1) {
      map.setView([positionedStores[0].latitude as number, positionedStores[0].longitude as number], 15);
    }
    if (userLocation) {
      if (userLocation.accuracy !== null && userLocation.accuracy > 0) {
        leaflet.circle([userLocation.lat, userLocation.lon], {
          radius: userLocation.accuracy,
          color: "#b78aff",
          weight: 1,
          opacity: 0.62,
          fillColor: "#8b5cf6",
          fillOpacity: 0.055,
          interactive: false,
        }).addTo(userLocationLayer);
      }
      const isCityReference = userLocation.precision === "city";
      const youIcon = leaflet.divIcon({
        className: isCityReference ? "zorvi-city-reference-icon" : "zorvi-user-location-icon",
        html: isCityReference
          ? '<span class="zorvi-city-reference"><i></i><b>' + escapeMapHtml(selectedCity || "Centro urbano") + '</b></span>'
          : '<span class="zorvi-user-location-dot"><i></i></span>',
        iconSize: isCityReference ? [142, 42] : [24, 24],
        iconAnchor: isCityReference ? [71, 21] : [12, 12],
      });
      leaflet.marker([userLocation.lat, userLocation.lon], { icon: youIcon })
        .addTo(userLocationLayer)
        .bindPopup(isCityReference
          ? '<b>Centro aproximado de ' + escapeMapHtml(selectedCity) + '</b><small>' + escapeMapHtml(BRAZIL_STATE_NAMES[selectedState] || selectedState) + '</small>'
          : userLocation.precision === "precise" ? "<b>GPS confirmado</b>" : userLocation.precision === "approximate" ? '<b>GPS aproximado</b><small>Margem de erro: ±' + Math.round(userLocation.accuracy || 0) + ' m</small>' : "<b>Ponto escolhido manualmente</b>");
    }
  }, [mapReady, mapStores, userLocation, searchPerformed, query, locationStatus, selectedMapStore, selectedCity, selectedState]);

  if (isSupabaseConfigured && authLoading) return <div className="zorvi-auth-loading"><img src="/zorvi-mark.webp" alt="ZORVI"/><span>Preparando sua experiência...</span></div>;
  if (isSupabaseConfigured && !session) return <AuthScreen />;

  return <div className={"zorvi-app " + (dark ? "theme-dark" : "theme-light")}>
    <div className="app-shell">
      <div className="zorvi-particle-field" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => <span key={index} className="zorvi-particle"/>) }
      </div>
      <header className="topbar">
        <div><div className="brand"><img className="brand-mark-image" src="/zorvi-mark.webp" alt="Símbolo ZORVI" /><span>ZORVI</span></div><p className="tagline">Tudo se conecta. Tudo se descobre.</p></div>
        <div className="top-actions"><button className="icon-button" onClick={() => setDark(!dark)} aria-label="Alternar tema">{dark ? <Sun size={19}/> : <Moon size={19}/>}</button><button className="icon-button" onClick={() => notify("Nenhuma notificação nova")} aria-label="Notificações"><Bell size={19}/></button><button className="avatar avatar-top" onClick={() => setTab("profile")} aria-label="Abrir perfil"><span className="avatar-fallback">{accountInitial}</span>{currentAvatarUrl && <img src={currentAvatarUrl} alt="Sua foto de perfil" onError={(event) => { event.currentTarget.style.display = "none"; }}/>}</button></div>
      </header>
      <main className="main-content">
        {tab === "home" && <section className="screen">
          <div className="welcome-row"><div><p className="eyebrow">SUA CIDADE, NOVAS POSSIBILIDADES</p><h1>Descubra o que<br/><span>move você.</span></h1></div><button className="location-pill" onClick={() => { setTab("map"); if (!userLocation) requestLocation(); }}><MapPin size={14}/> {userLocation ? (userLocation.precision === "precise" ? "GPS preciso" : userLocation.precision === "approximate" ? "GPS aproximado" : "Ponto selecionado") : "Definir localização"}</button></div>
          <button className="search-hero" onClick={() => setTab("search")}><Search size={18}/><span>O que você quer descobrir hoje?</span><Compass size={17}/></button>
          <div className="section-heading"><div><p className="eyebrow">PERTO DE VOCÊ</p><h2>Explore possibilidades</h2></div><button className="text-link" onClick={() => setTab("map")}>Ver mapa <ArrowRight size={15}/></button></div>
          <div className="discovery-cards"><button className="discovery-card discovery-purple" onClick={() => setTab("map")}><span className="discovery-icon"><MapPin size={19}/></span><b>Mapa inteligente</b><small>Lugares ao seu redor</small><ArrowRight className="discovery-arrow" size={17}/></button><button className="discovery-card discovery-pink" onClick={() => setTab("ai")}><span className="discovery-icon"><Sparkles size={19}/></span><b>ZORVI AI</b><small>Descubra com inteligência</small><ArrowRight className="discovery-arrow" size={17}/></button></div>
          <div className="section-heading feed-heading"><div><p className="eyebrow">COMUNIDADE ZORVI</p><h2>O que está acontecendo</h2></div><button className="round-add" onClick={() => setComposer(true)}><Plus size={19}/></button></div>
          <div className="stories">{["Seu momento","Marina","Pedro","Camila","Lucas"].map((n,i) => <button className="story" key={n} onClick={() => i === 0 ? setComposer(true) : notify("Stories em breve")}><span className={"story-ring story-" + i}>{i === 0 ? <Plus size={20}/> : n[0]}</span><small>{n}</small></button>)}</div>
          {feedLoading && <p className="feed-status">Carregando publicações...</p>}
          {!feedLoading && posts.length === 0 && <div className="feed-empty"><Sparkles size={25}/><b>O feed está esperando por você.</b><span>Compartilhe a primeira descoberta da comunidade ZORVI.</span><button className="primary-button" onClick={() => setComposer(true)}>Criar publicação <Plus size={15}/></button></div>}
          {posts.map((p) => <article className="post-card" key={p.id}><div className="post-header"><div className="avatar">{p.author?.avatar_url ? <img src={p.author.avatar_url} alt=""/> : (p.author?.display_name || "Z")[0]}</div><div className="post-author"><b>{p.author?.display_name || "Explorador ZORVI"}</b><small>@{p.author?.username || "explorador"} · {new Date(p.created_at).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}</small></div>{session?.user.id === p.user_id && <div className="post-menu-wrap"><button type="button" className="icon-button post-menu-trigger" aria-label="Opções da publicação" aria-expanded={postMenuId === p.id} onClick={() => setPostMenuId((current) => current === p.id ? null : p.id)}><MoreHorizontal size={19}/></button>{postMenuId === p.id && <div className="post-menu"><button type="button" className="edit-post-action" onClick={() => openEditPost(p)}><Pencil size={15}/> Editar publicação</button><button type="button" className="delete-post-action" onClick={() => { setPostMenuId(null); setPostToDelete(p); }}><Trash2 size={15}/> Excluir publicação</button></div>}</div>}</div>{p.content && <p className="post-copy">{p.content}</p>}{p.image_url && <div className="post-image-wrap"><img src={p.image_url} alt="Imagem da publicação"/><span className="post-tag">DESCOBERTA</span></div>}{p.location_name && <div className="post-place"><MapPin size={14}/> {p.location_name}</div>}<div className="post-actions"><button className={p.liked ? "action-active" : ""} onClick={() => void toggleLike(p)}><Heart size={19} fill={p.liked ? "currentColor" : "none"}/> {p.likes_count}</button><button onClick={() => void openComments(p)}><MessageCircle size={19}/> {p.comments_count}</button><button onClick={() => { void navigator.clipboard?.writeText(window.location.href + "?post=" + p.id); notify("Link da publicação copiado."); }}><Share2 size={18}/></button></div></article>)}
          <p className="demo-note">Estabelecimentos cadastrados no catálogo. Ofertas só aparecem quando há fonte e verificação.</p>
        </section>}
        {tab === "map" && <section className="screen map-screen">
          <div className="map-screen-header">
            <div>
              <p className="eyebrow">COMPARE ANTES DE SAIR</p>
              <h1>Mapa de preços</h1>
              <p>Descubra onde comprar melhor, perto de você.</p>
            </div>
            <button className="map-refresh-button" onClick={() => void loadNearbyStores()} aria-label="Atualizar estabelecimentos"><RefreshCw size={17}/></button>
          </div>

          <div className="map-search-row">
            <div className="map-search">
              <Search size={18}/>
              <input value={query} onChange={e=>{setQuery(e.target.value);setSearchPerformed(false);setSearchProductCategory(null);setPriceResults([]);setPriceHistory([]);setSearchCandidates([]);setSelectedPriceProduct(null);setSelectedMapStore(null);}} onKeyDown={e=>{if(e.key==="Enter")void searchPrices();}} placeholder="Produto, marca, tamanho ou código de barras" aria-label="Buscar produto"/>
              {query && <button onClick={()=>{setQuery("");setSearchPerformed(false);setSearchProductCategory(null);setPriceResults([]);setPriceHistory([]);setSearchCandidates([]);setSelectedPriceProduct(null);setSelectedMapStore(null);}} aria-label="Limpar busca"><X size={16}/></button>}
            </div>
            <button className="primary-button price-search-button" disabled={catalogLoading||!query.trim()} onClick={()=>void searchPrices()}>
              {catalogLoading ? <span className="map-button-loading"/> : <Search size={16}/>}
              <span>{catalogLoading ? "Buscando" : "Comparar"}</span>
            </button>
          </div>

          <div className="map-location-bar">
            <div className={"map-location-indicator" + (userLocation || selectedCity ? " is-active" : "")} title={locationStatus}>
              <span className="map-location-indicator-dot"/>
              <span className="map-location-copy">
                <b>{selectedCity ? "Região selecionada" : userLocation ? userLocation.precision === "precise" ? "GPS confirmado" : userLocation.precision === "approximate" ? "GPS aproximado" : "Ponto manual" : locationStatus.startsWith("Buscando") ? "Buscando GPS" : "Defina sua região"}</b>
                <small>{selectedCity ? selectedCity + ", " + (BRAZIL_STATE_NAMES[selectedState] || selectedState) + " · centro urbano aproximado" : userLocation ? userLocation.precision === "manual" ? "Ponto escolhido no mapa" : "Precisão de ±" + Math.round(userLocation.accuracy || 0) + " m" : locationStatus}</small>
              </span>
            </div>
            <div className="map-location-actions">
              <button onClick={requestLocation}><LocateFixed size={15}/> GPS</button>
              <button className={cityFormOpen ? "manual-location-active" : ""} onClick={() => setCityFormOpen((open) => !open)}><MapPin size={14}/> Cidade</button>
              <button className={manualLocationPicking ? "manual-location-active" : ""} onClick={() => { const next = !manualLocationPicking; manualLocationPickingRef.current = next; setManualLocationPicking(next); setLocationStatus(next ? "Toque no mapa para escolher sua localização manualmente." : "Seleção manual encerrada. Use o GPS ou escolha uma cidade."); }}>{manualLocationPicking ? "Cancelar" : "No mapa"}</button>
            </div>
          </div>
          {cityFormOpen && <form className="map-city-form" onSubmit={(event) => { event.preventDefault(); void saveCityRegion(); }}>
            <div className="map-city-form-heading"><span><MapPin size={17}/></span><div><b>Onde você quer buscar?</b><small>Informe cidade e estado para encontrar estabelecimentos e preços da região.</small></div></div>
            <div className="map-city-fields">
              <label>Cidade<input value={cityInput} onChange={(event) => setCityInput(event.target.value)} placeholder="Ex.: Teresina" autoComplete="address-level2" required minLength={2}/></label>
              <label>Estado<select value={stateInput} onChange={(event) => setStateInput(event.target.value)} required><option value="">UF</option>{BRAZIL_STATES.map((state) => <option key={state.code} value={state.code}>{state.code} · {state.name}</option>)}</select></label>
            </div>
            <button className="map-city-submit" type="submit" disabled={cityLookupLoading}>{cityLookupLoading ? <span className="map-button-loading"/> : <MapPin size={15}/>} {cityLookupLoading ? "Localizando região..." : "Usar esta localização"} <ArrowRight size={15}/></button>
          </form>}
          {!cityFormOpen && selectedCity && <div className="map-region-summary"><span>Buscando em <b>{selectedCity}, {selectedState}</b></span><button onClick={() => setCityFormOpen(true)}>Alterar cidade</button></div>}
          <div className="filter-row map-filter-row" aria-label="Filtrar estabelecimentos">
            {["Todos","Farmácia","Mercado","Restaurante","Lojas","Outros"].map(f=><button key={f} className={filter===f?"filter-chip selected":"filter-chip"} onClick={()=>{setFilter(f);setSelectedMapStore(null);}}>{f}</button>)}
          </div>

          <div className="zorvi-map-frame">
            <div className="zorvi-map-topline">
              <span><i className="map-live-indicator"/> {mapBaseStyle === "vector" ? "MAPA ZORVI" : mapBaseStyle === "fallback" ? "MAPA ALTERNATIVO" : "CARREGANDO MAPA"}</span>
              <span>{mapStores.filter(store=>store.latitude!==null&&store.longitude!==null).length} {mapStores.filter(store=>store.latitude!==null&&store.longitude!==null).length === 1 ? "estabelecimento" : "estabelecimentos"}</span>
            </div>
            <div ref={mapContainerRef} className={"zorvi-leaflet-map" + (manualLocationPicking ? " is-picking" : "")} aria-label="Mapa interativo de estabelecimentos e preços"/>
            {!mapReady&&!mapLoadError&&<div className="zorvi-map-overlay"><span className="map-loading-spinner"/><b>Preparando seu mapa...</b><span>Carregando ruas e estabelecimentos</span></div>}
            {mapLoadError&&<div className="zorvi-map-overlay map-load-error"><b>Não foi possível carregar o mapa.</b><span>{mapLoadError}</span><button onClick={()=>setMapInstanceKey(value=>value+1)}>Tentar novamente</button></div>}
            {manualLocationPicking&&<div className="map-picking-hint">Toque no mapa para marcar sua localização</div>}
            <button className="zorvi-map-gps" onClick={requestLocation} aria-label="Centralizar na minha localização"><LocateFixed size={19}/></button>
            <div className="zorvi-map-legend"><span><i className="legend-user"/> Você</span><span><i className="legend-pharmacy"/> Farmácias</span><span><i className="legend-market"/> Mercados</span><span><i className="legend-other"/> Outros</span></div>
            <div className="map-data-attribution">Estabelecimentos: © OpenStreetMap contributors · ODbL</div>
          </div>

          <section className={"map-results-sheet" + (selectedMapStore ? " has-selection" : "") + (mapSheetExpanded ? " is-expanded" : "")} aria-label="Estabelecimentos na região">
            <button type="button" className="map-sheet-handle" onClick={() => setMapSheetExpanded(value => !value)} aria-expanded={mapSheetExpanded} aria-label={mapSheetExpanded ? "Recolher lista de estabelecimentos" : "Expandir lista de estabelecimentos"}/>
            <div className="map-sheet-header">
              <div>
                <p className="eyebrow">{searchPerformed ? "RESULTADOS DA BUSCA" : selectedCity ? "REGIÃO SELECIONADA" : userLocation ? "AO SEU REDOR" : "ESTABELECIMENTOS CADASTRADOS"}</p>
                <h2>{mapStores.length} {mapStores.length === 1 ? "estabelecimento" : "estabelecimentos"}</h2>
              </div>
              <button className="map-sheet-refresh" onClick={() => void geocodeStores(false, "verify")} disabled={geocodingStores}><MapPin size={14}/> {geocodingStores ? "Validando..." : "Validar Google"}</button>
            </div>
            <div className="map-sheet-summary">
              <span><b>{mapLocatedCount}</b> no mapa{mapPendingCount > 0 ? " · " + mapPendingCount + " aguardando localização" : " · todos localizados"}</span>
              {searchPerformed ? <span>Menor preço <b>{bestMapPrice === null ? "não encontrado" : formatMapPrice(bestMapPrice)}</b></span> : <span>{filter === "Todos" ? "Todas as categorias" : filter} · Google Maps {mapGoogleVerifiedCount}/{mapStores.length} vinculados</span>}
            </div>

            {selectedMapStore && <div className="map-selected-store">
              <span className="store-brand-mini" style={{"--brand-accent":getStoreBrand(selectedMapStore).color} as CSSProperties}><b>{getStoreBrand(selectedMapStore).initials}</b>{getStoreBrandLogo(selectedMapStore)&&<img src={getStoreBrandLogo(selectedMapStore)} alt="" onError={event=>event.currentTarget.remove()}/>}</span>
              <div className="place-info">
                <b>{selectedMapStore.brand_name||selectedMapStore.name}</b>
                <small>{selectedMapStore.address} · {selectedMapStore.city}</small>
                {typeof selectedMapStore.mapPrice==="number" ? <strong>{getMapPriceLabel(selectedMapStore.mapPriceType)} · {formatMapPrice(selectedMapStore.mapPrice)}</strong> : searchPerformed ? <small>Preço ainda não confirmado para esta unidade.</small> : <small>{selectedMapStore.distance===null ? (selectedMapStore.latitude!==null && selectedMapStore.longitude!==null ? "Coordenadas cadastradas" : "Localização pendente") : selectedMapStore.distance.toFixed(1) + (userLocation?.precision==="city" && selectedCity ? " km do centro de " + selectedCity : " km de você")}</small>}
                {selectedMapStore.google_match_status === "verified" && <small>Referência do Google Maps vinculada</small>}
              </div>
              <div className="map-selected-actions">
                {selectedMapStore.website_url && <a href={selectedMapStore.website_url} target="_blank" rel="noreferrer">Site</a>}
                {selectedMapStore.source_url && selectedMapStore.osm_type && <a href={selectedMapStore.source_url} target="_blank" rel="noreferrer">OpenStreetMap</a>}
                {selectedMapStore.google_place_id && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((selectedMapStore.brand_name||selectedMapStore.name) + " " + selectedMapStore.address + " " + selectedMapStore.city)}&query_place_id=${encodeURIComponent(selectedMapStore.google_place_id)}`} target="_blank" rel="noreferrer">Google Maps</a>}
                {selectedMapStore.latitude !== null && selectedMapStore.longitude !== null && <a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedMapStore.latitude},${selectedMapStore.longitude}`} target="_blank" rel="noreferrer">Rotas</a>}
              </div>
              <button className="map-selected-close" onClick={()=>setSelectedMapStore(null)} aria-label="Fechar detalhes"><X size={15}/></button>
            </div>}

            <div className="map-sheet-list">
              {mapStores.map(store=>{
                const brand=getStoreBrand(store);
                const logoUrl=getStoreBrandLogo(store);
                const distanceLabel=store.latitude===null||store.longitude===null?"Coordenada pendente":store.distance===null?"Coordenadas cadastradas":(userLocation?.precision==="approximate"||userLocation?.precision==="city"?"≈ ":"")+(store.distance<1?Math.round(store.distance*1000)+" m":store.distance.toFixed(1)+" km");
                const metric=typeof store.mapPrice==="number"?(store.mapPriceType==="estimated"?"≈ ":"")+formatMapPrice(store.mapPrice):searchPerformed?"Sem preço confirmado":distanceLabel;
                return <button type="button" className={"map-store-row"+(selectedMapStore?.id===store.id?" is-selected":"")} key={store.id} onClick={()=>{
                  setSelectedMapStore(store);
                  setMapSheetExpanded(true);
                  if(store.latitude!==null&&store.longitude!==null)leafletMapRef.current?.setView([store.latitude,store.longitude],16);
                }}>
                  <span className="store-brand-mini" style={{"--brand-accent":brand.color} as CSSProperties}><b>{brand.initials}</b>{logoUrl&&<img src={logoUrl} alt="" onError={event=>event.currentTarget.remove()}/>}</span>
                  <span className="place-info"><b>{store.brand_name||store.name}</b><small>{store.address} · {store.city}</small></span>
                  <span className="map-store-metric">{metric}</span>
                  <ArrowRight size={15}/>
                </button>;
              })}
              {storeError&&<p className="empty-state">{storeError}</p>}
              {!catalogLoading&&mapStores.length===0&&!storeError&&<p className="empty-state">Nenhum estabelecimento encontrado nesta categoria.</p>}
              {catalogLoading&&<p className="empty-state">Atualizando estabelecimentos...</p>}
            </div>

            {mapStores.some(store=>store.latitude===null||store.longitude===null)&&<div className="map-coordinate-note">
              <span>{geocodingStores ? "Buscando coordenadas automaticamente pelos endereços..." : mapStores.filter(store=>store.latitude===null||store.longitude===null).length + " lojas ainda aguardam uma localização confiável."}</span>
              <button onClick={()=>void geocodeStores()} disabled={geocodingStores||mapStores.every(store=>store.latitude!==null&&store.longitude!==null)}>{geocodingStores?"Localizando...":"Tentar novamente"}</button>
            </div>}
            {mapGooglePendingCount > 0 && <div className="map-coordinate-note">
              <span>{geocodingStores ? "Conferindo nome, endereço e coordenadas com o Google Maps..." : mapGooglePendingCount + " estabelecimento(s) ainda não têm uma referência confirmada no Google Maps."}</span>
            </div>}
          </section>

          {searchPerformed&&searchCandidates.length>0&&<div className="price-results map-product-candidates">
            <div className="nearby-head"><div><p className="eyebrow">CONFIRME O PRODUTO</p><h2>Encontramos {searchCandidates.length} opções</h2><small>Escolha a marca e a apresentação exatas para não comparar produtos diferentes.</small></div></div>
            {searchCandidates.map(product=><button type="button" className="map-product-candidate" key={product.id} onClick={()=>void choosePriceProduct(product)}>
              <span><b>{product.name}</b><small>{[product.brand,product.variant,product.unit].filter(Boolean).join(" · ") || product.category}</small></span>
              <ArrowRight size={16}/>
            </button>)}
          </div>}
          {searchPerformed&&selectedPriceProduct&&<div className="price-results map-price-results">
            <div className="nearby-head"><div><p className="eyebrow">COMPARAÇÃO DE PREÇOS</p><h2>{priceResults.length} estabelecimentos encontrados</h2><small>{selectedPriceProduct.name}{selectedPriceProduct.variant?" · "+selectedPriceProduct.variant:""}</small></div><button type="button" className="price-report-trigger" onClick={()=>openPriceReport()}>Informar preço</button></div>
            <div className="comparison-summary">
              <div className="comparison-summary-main"><small>MENOR PREÇO ATUALIZADO</small><strong>{comparisonStats.cheapest ? formatMapPrice(Number(comparisonStats.cheapest.price)) : "Sem preço recente"}</strong><span>{comparisonStats.cheapest ? comparisonStats.cheapest.store.name : "Nenhum preço confirmado nos últimos 7 dias"}</span></div>
              <div className="comparison-summary-savings"><small>ECONOMIA POSSÍVEL</small><strong>{comparisonStats.freshCount > 1 ? formatMapPrice(comparisonStats.savings) : "—"}</strong><span>{comparisonStats.freshCount > 1 ? comparisonStats.savingsPercent.toFixed(2).replace(".",",") + "% comparado ao maior preço recente" : "Compare pelo menos duas lojas"}</span></div>
              <p>{comparisonStats.freshCount} estabelecimento(s) com preço atualizado. Preços com mais de 7 dias aparecem abaixo como antigos e não definem o menor preço.</p>
            </div>
            {priceResults.map(r=><div className={"price-result-row" + (r.is_stale ? " is-stale" : "")} key={r.id}><div className="place-info"><b>{r.store.name}</b><small>{r.is_online ? "Canal online" : "Loja física"} · {r.price_type === "estimated" ? "estimativa baseada na fonte" : r.price_type === "official_site" ? "preço do site" : r.price_type === "community_report" ? "relato comunitário validado" : "preço informado em loja"} · {r.source_label}</small><small>Atualizado em {new Date(r.observed_at).toLocaleString("pt-BR")} · {r.is_stale ? "Preço antigo — confirme antes de comprar" : r.availability_status === "available" ? "disponibilidade indicada pela fonte" : "estoque não confirmado"}</small></div><strong>{formatMapPrice(Number(r.price))}</strong>{r.source_url&&<a href={r.source_url} target="_blank" rel="noreferrer">Fonte</a>}</div>)}
            {priceHistory.length > 0 && <div className="price-history">
              <button type="button" className="price-history-toggle" onClick={() => setHistoryExpanded((open) => !open)}><span><small>HISTÓRICO DE PREÇOS</small><b>{priceHistory.length} registro(s) nos últimos 90 dias</b><em>Veja quando o preço mudou em cada estabelecimento.</em></span><ArrowRight size={17} className={historyExpanded ? "expanded" : ""}/></button>
              {historyExpanded && <div className="price-history-list">{priceHistory.slice(0,16).map((item) => <div className="price-history-row" key={item.id}><span><b>{item.store_name}</b><small>{item.is_online ? "Online" : "Loja física"} · {new Date(item.observed_at).toLocaleString("pt-BR")}</small></span><strong>{formatMapPrice(Number(item.price))}</strong></div>)}</div>}
            </div>}
            {priceResults.length===0&&<div className="price-report-empty"><p>Nenhum preço verificado disponível para este produto nos estabelecimentos da região.</p><small>Você pode enviar um preço observado. Ele ficará pendente até ser revisado.</small><button type="button" className="price-report-trigger" onClick={()=>openPriceReport()}>Contribuir com um preço</button></div>}
          </div>}
          {searchPerformed&&!selectedPriceProduct&&searchCandidates.length===0&&!catalogLoading&&<div className="price-results map-price-results"><p className="empty-state">Produto não encontrado no catálogo. Tente usar o nome completo, a marca, a apresentação ou o código de barras.</p></div>}
          <p className="demo-note map-demo-note">Preços só aparecem quando existe uma fonte verificável. Ainda não há integração automática com todos os sites de farmácias.</p>
        </section>}
        {tab === "ai" && <section className="screen ai-screen">
          <div className="ai-heading"><div className="ai-orb"><img src="/zorvi-mark.webp" alt="Símbolo ZORVI" /></div><p className="eyebrow">SUA COMPANHEIRA DE DESCOBERTAS</p><h1>Olá! Eu sou a<br/><span>ZORVI AI.</span></h1><p>Encontre produtos, compare informações confiáveis e descubra opções na sua região.</p></div>
          <div className="chat-panel"><div className="chat-top"><div className="ai-mini"><Sparkles size={16}/></div><div><b>ZORVI AI</b><small><i className={"online-dot " + (chatMode === "ai" ? "" : chatMode === "error" ? "error-dot" : "catalog-dot")}/>{chatSending ? "Consultando catálogo e informações..." : chatMode === "ai" ? "IA conectada · catálogo real" : chatMode === "catalog" ? "Busca real do catálogo" : chatMode === "error" ? "Conexão indisponível" : "Pronta para pesquisar"}</small></div><button className="icon-button" aria-label="Reiniciar conversa" title="Reiniciar conversa" onClick={() => {setChat([{role:"assistant",text:"Conversa reiniciada! O que você quer descobrir hoje?"}]);setChatMode("idle");setMessage("");}}><MoreHorizontal size={18}/></button></div>
          <div className="chat-messages">{chat.map((m,i) => <div className={"chat-message " + m.role} key={i}>{m.role === "assistant" && <span className="chat-avatar"><Sparkles size={13}/></span>}<p>{m.text}</p>{m.results && m.results.length > 0 && <div className="chat-result-list">{m.results.map((r) => <div className="chat-result-card" key={r.id}><div className="chat-result-copy"><b>{r.productName}</b><small>{[r.brand,r.variant,r.unit].filter(Boolean).join(" · ")}</small><small>{r.storeName}</small><small>{r.isOnline ? "Canal digital regionalizado · sem filial física específica · " + r.storeCity + " - " + r.storeState : r.storeAddress + ", " + r.storeCity + " - " + r.storeState}</small>{!r.isOnline && <a href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([r.storeAddress,r.storeCity,r.storeState].filter(Boolean).join(", "))} target="_blank" rel="noreferrer">Ver endereço no Maps</a>}<small>{r.priceType === "estimated" ? "Estimativa baseada na fonte" : r.priceType === "official_site" ? "Preço publicado no site" : r.priceType === "community_report" ? "Relato da comunidade validado" : "Preço informado em loja"}</small><small>{r.sourceLabel} · Atualizado em {new Date(r.observedAt).toLocaleString("pt-BR")}</small><small>{r.availabilityStatus === "available" ? "Disponibilidade indicada pela fonte · confirme com a loja" : "Estoque não confirmado"}</small>{r.distanceKm !== null && <small>{r.distanceKm.toFixed(1).replace(".",",")} km do ponto selecionado</small>}{r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noreferrer">Consultar fonte</a>}</div><strong>R$ {Number(r.price).toFixed(2).replace(".",",")}</strong></div>)}</div>}</div>)}{chatSending && <div className="chat-message assistant chat-thinking"><span className="chat-avatar"><Sparkles size={13}/></span><p>Estou consultando as informações disponíveis...</p></div>}</div>
          {chat.length <= 1 && <><div className="suggestion-label">EXPERIMENTE PERGUNTAR</div><div className="suggestions"><button onClick={() => void send("Onde encontro dipirona 500 mg mais barato nas farmácias?")}><Wallet size={14}/> Comparar preços de um produto</button><button onClick={() => void send("Quais farmácias e mercados estão cadastrados na minha região? Mostre os endereços.")}><Compass size={14}/> Farmácias e mercados próximos</button><button onClick={() => void send("Quais produtos estão cadastrados no catálogo da ZORVI?")}><Zap size={14}/> Produtos do catálogo</button></div></>}
          <form className="chat-input" onSubmit={(e) => {e.preventDefault();void send(message);}}><input value={message} onChange={(e) => setMessage(e.target.value)} disabled={chatSending} placeholder="Pergunte sobre produtos, preços, farmácias ou mercados..."/><button type="submit" disabled={chatSending || !message.trim()}><Send size={18}/></button></form></div>
          <p className="demo-note">A ZORVI consulta o catálogo e os preços verificados. Informações sem confirmação são identificadas.</p>
        </section>}
        {tab === "search" && <section className="screen"><div className="screen-title"><div><p className="eyebrow">ENCONTRE SUA PRÓXIMA DESCOBERTA</p><h1>Explorar</h1><p>Produtos, lugares, preços e experiências.</p></div></div><div className="search-large"><Search size={20}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="O que você está procurando?"/><button onClick={() => setQuery("")}><X size={16}/></button></div><p className="eyebrow category-label">CATEGORIAS POPULARES</p><div className="category-grid">{[{name:"Mercados",icon:ShoppingBag},{name:"Restaurantes",icon:Utensils},{name:"Farmácias",icon:Plus},{name:"Experiências",icon:Sparkles}].map((c) => {const Icon=c.icon;return <button className="category-card" key={c.name} onClick={() => {setFilter(c.name==="Mercados"?"Mercado":c.name==="Restaurantes"?"Restaurante":c.name==="Farmácias"?"Farmácia":"Todos");setTab("map");}}><span className="place-icon"><Icon size={21}/></span><b>{c.name}</b><ArrowRight size={15}/></button>;})}</div><div className="section-heading search-trends"><div><p className="eyebrow">EM ALTA NA COMUNIDADE</p><h2>Descobertas populares</h2></div></div>{["Cafés para conhecer","Economize nas compras","Descubra com a ZORVI AI"].map((t,i) => <button className="trend-row" key={t} onClick={() => setTab(i===2?"ai":"map")}><span className="trend-icon">{i===2?<Sparkles size={18}/>:<ShoppingBag size={18}/>}</span><span><b>{t}</b><small>Ideias para sua próxima descoberta</small></span><ArrowRight size={17}/></button>)}<p className="demo-note">Resultados e tendências são exemplos para demonstração.</p></section>}
        {tab === "profile" && <section className="screen"><div className="profile-top"><p className="eyebrow">SEU ESPAÇO ZORVI</p><button className="icon-button" onClick={() => notify("Configurações em breve")}><Settings2 size={20}/></button></div><div className="profile-hero">
            <div className={`profile-banner ${getProfileAnimationClass(equippedBannerAsset?.animation_type)}`} style={{ backgroundImage: equippedBannerAsset ? `url("${equippedBannerAsset.asset_url}")` : undefined }} aria-hidden="true"/>
            <div className="profile-avatar profile-avatar-main">
              <span className="profile-avatar-core">
                <span className="avatar-fallback">{accountInitial}</span>
                {currentAvatarUrl && <img className={`profile-avatar-photo ${getProfileAnimationClass(profile?.avatar_url ? null : equippedAvatarAsset?.animation_type)}`} src={currentAvatarUrl} alt={"Foto de " + accountName} onError={(event) => { event.currentTarget.style.display = "none"; }}/>}
              </span>
              {equippedDecorationAsset && <img className={`profile-avatar-decoration ${getProfileAnimationClass(equippedDecorationAsset.animation_type)}`} style={getDecorationFitStyle(equippedDecorationAsset)} src={equippedDecorationAsset.asset_url} alt="" aria-hidden="true"/>}
              <span className="profile-online"/>
            </div>
            <h1>{accountName}</h1>
            <p>@{profile?.username || "explorador"} · {session?.user.email || "Explorador ZORVI"}</p>
            {profile?.bio && <p className="profile-bio">{profile.bio}</p>}
            <div className="profile-badges">{featuredBadges.map((badge) => <span className="profile-badge-pill" key={badge.id}><img src={badge.asset_url} alt=""/>{badge.name}</span>)}</div>
            <small className="profile-member-since">Explorador desde {profile?.created_at ? new Date(profile.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "agora"}</small>
            <button className="edit-profile" onClick={openProfileEditor}>Personalizar perfil</button>
          </div><div className="profile-menu"><button onClick={() => notify(saved.length + " itens salvos nesta sessão")}><Bookmark size={19}/><span><b>Itens salvos</b><small>Suas descobertas favoritas</small></span><ArrowRight size={17}/></button><button onClick={() => notify("Suas avaliações aparecerão aqui")}><Heart size={19}/><span><b>Avaliações</b><small>Compartilhe suas experiências</small></span><ArrowRight size={17}/></button><button onClick={() => setDark(!dark)}>{dark?<Sun size={19}/>:<Moon size={19}/>}<span><b>Aparência</b><small>{dark?"Tema escuro ativado":"Tema claro ativado"}</small></span><span className={"toggle-pill " + (dark?"on":"")}/></button><button onClick={() => notify("Preferências em breve")}><Settings2 size={19}/><span><b>Configurações</b><small>Privacidade e preferências</small></span><ArrowRight size={17}/></button>{session && <button onClick={signOut}><UserRound size={19}/><span><b>Sair da conta</b><small>Encerrar sua sessão com segurança</small></span><ArrowRight size={17}/></button>}</div>{session && <PriceReviewPanel />}
          {isZorviAdmin && <section className="monitoring-panel">
            <div className="monitoring-head">
              <div><p className="eyebrow">ADMINISTRAÇÃO ZORVI</p><h2>Monitoramento das integrações</h2><small>{monitoringData?.scheduleLabel || "Sincronização diária"}</small></div>
              <button type="button" className="icon-button" onClick={() => void refreshMonitoring(false)} disabled={monitoringLoading} aria-label="Atualizar monitoramento"><RefreshCw size={17} className={monitoringLoading ? "monitoring-spin" : ""}/></button>
            </div>
            {monitoringError && <p className="monitoring-error">{monitoringError}</p>}
            {!monitoringData ? <p className="monitoring-empty">{monitoringLoading ? "Carregando dados das integrações..." : "Nenhum dado de monitoramento disponível."}</p> : <>
              <div className="monitoring-total-grid">
                <div><small>Produtos ativos</small><b>{monitoringData.totals.activeProducts.toLocaleString("pt-BR")}</b></div>
                <div><small>Preços verificados</small><b>{monitoringData.totals.verifiedPrices.toLocaleString("pt-BR")}</b></div>
                <div><small>Canais online</small><b>{monitoringData.totals.onlineChannels.toLocaleString("pt-BR")}</b></div>
              </div>
              <div className="monitoring-subhead"><b>Fontes de preços</b><small>{monitoringData.lastSyncAt ? "Última execução: " + new Date(monitoringData.lastSyncAt).toLocaleString("pt-BR") : "Aguardando primeira execução registrada"}</small></div>
              <div className="monitoring-integrations">{monitoringData.integrations.map((integration) => <div className="monitoring-integration" key={integration.id}>
                <div className="monitoring-integration-title"><b>{integration.name}</b><span>{integration.category}</span></div>
                <div className="monitoring-integration-stats">
                  <span><strong>{integration.verifiedPrices.toLocaleString("pt-BR")}</strong><small>preços</small></span>
                  <span><strong>{integration.products.toLocaleString("pt-BR")}</strong><small>produtos</small></span>
                  <span><strong>{integration.updatedLast24h.toLocaleString("pt-BR")}</strong><small>últimas 24h</small></span>
                </div>
                <small className="monitoring-last-seen">{integration.lastObservedAt ? "Último preço: " + new Date(integration.lastObservedAt).toLocaleString("pt-BR") : "Nenhum preço registrado"}</small>
              </div>)}</div>
              <div className="monitoring-subhead"><b>Execuções recentes</b><small>Histórico automático e manual</small></div>
              <div className="monitoring-runs">{monitoringData.recentRuns.length ? monitoringData.recentRuns.slice(0,6).map((run) => <div className="monitoring-run" key={run.id}>
                <span className={"monitoring-run-status status-" + run.status}>{run.status === "success" ? "Concluída" : run.status === "partial" ? "Parcial" : run.status === "failed" ? "Falhou" : "Em andamento"}</span>
                <span className="monitoring-run-copy"><b>{run.trigger_source === "scheduled" ? "Agendada" : "Manual"} · {run.requested_source === "all" ? "Todas as fontes" : run.requested_source}</b><small>{new Date(run.started_at).toLocaleString("pt-BR")}{run.error_message ? " · " + run.error_message : ""}</small></span>
                <strong>{Number(run.summary?.totalPricesInserted || 0).toLocaleString("pt-BR")} preços</strong>
              </div>) : <p className="monitoring-empty">Ainda não há execuções registradas. A próxima sincronização será exibida aqui.</p>}</div>
            </>}
          </section>}<div className="profile-invite"><Sparkles size={19}/><div><b>Convide sua comunidade</b><small>Descobertas ficam melhores quando compartilhadas.</small></div><button onClick={() => notify("Convite copiado (demonstração)")}><Share2 size={17}/></button></div><p className="demo-note">{session ? "Conta conectada com Supabase." : "Modo demonstração. Configure o Supabase para ativar contas reais."}</p></section>}
      </main>
      <nav className="bottom-nav" aria-label="Navegação principal">{[{id:"home" as Tab,label:"Início",icon:Home},{id:"map" as Tab,label:"Mapa",icon:MapPin},{id:"ai" as Tab,label:"ZORVI AI",icon:Sparkles},{id:"search" as Tab,label:"Explorar",icon:Compass},{id:"profile" as Tab,label:"Perfil",icon:UserRound}].map((item) => {const Icon=item.icon;return <button key={item.id} className={"nav-item "+(tab===item.id?"active":"")+(item.id==="ai"?" nav-ai":"")} onClick={() => setTab(item.id)}><span><Icon size={item.id==="ai"?21:20}/></span><small>{item.label}</small></button>;})}</nav>
    </div>
    {editProfileOpen && <div className="modal-backdrop" onClick={() => !profileSaving && setEditProfileOpen(false)}><div className="composer-modal profile-edit-modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-head"><h2>Editar perfil</h2><button className="icon-button" onClick={() => setEditProfileOpen(false)} disabled={profileSaving}><X size={19}/></button></div>
      <div className="avatar-edit-wrap">
        <div className="profile-avatar edit-avatar-preview">
          <span className="profile-avatar-core">
            <span className="avatar-fallback">{accountInitial}</span>
            {(avatarPreview || selectedAvatarAsset) && <img className={`profile-avatar-photo ${getProfileAnimationClass(avatarPreview ? null : selectedAvatarAsset?.animation_type)}`} src={avatarPreview || selectedAvatarAsset?.asset_url || ""} alt="Prévia do avatar" onError={(event) => { event.currentTarget.style.display = "none"; }}/>}
          </span>
          {selectedDecorationAsset && <img className={`profile-avatar-decoration ${getProfileAnimationClass(selectedDecorationAsset.animation_type)}`} style={getDecorationFitStyle(selectedDecorationAsset)} src={selectedDecorationAsset.asset_url} alt="" aria-hidden="true"/>}
        </div>
        <label className="avatar-upload-button"><Camera size={15}/> Enviar foto própria<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => chooseAvatar(e.target.files?.[0])}/></label>
        <small>Ou escolha um item da galeria abaixo · foto própria até 5 MB</small>
      </div>
      {selectedBannerAsset && <div className="profile-selected-banner-preview"><img className={getProfileAnimationClass(selectedBannerAsset.animation_type)} src={selectedBannerAsset.asset_url} alt={"Prévia do banner " + selectedBannerAsset.name}/><small>Prévia do banner · {selectedBannerAsset.name}{selectedBannerAsset.animation_type !== "none" ? " · Animado" : ""}</small></div>}
      <div className="profile-asset-picker">
        <div className="profile-asset-tabs">
          <button type="button" className={profileAssetTab === "avatar" ? "active" : ""} onClick={() => setProfileAssetTab("avatar")}>Avatares</button>
          <button type="button" className={profileAssetTab === "decoration" ? "active" : ""} onClick={() => setProfileAssetTab("decoration")}>Decorações</button>
          <button type="button" className={profileAssetTab === "banner" ? "active" : ""} onClick={() => setProfileAssetTab("banner")}>Banners</button>
          <button type="button" className={profileAssetTab === "badge" ? "active" : ""} onClick={() => setProfileAssetTab("badge")}>Insígnias</button>
        </div>
        {profileAssetTab === "avatar" && <div className="profile-asset-grid">{profileAssets.filter((asset) => asset.asset_type === "avatar").map((asset) => {
          const owned = profileInventoryIds.includes(asset.id);
          return <button type="button" key={asset.id} disabled={!owned} className={"profile-asset-option" + (selectedAvatarAssetId === asset.id ? " selected" : "")} onClick={() => { if (avatarPreview.startsWith("blob:")) URL.revokeObjectURL(avatarPreview); setAvatarFile(null); setAvatarPreview(""); setSelectedAvatarAssetId(asset.id); }}>
            <img className={getProfileAnimationClass(asset.animation_type)} src={asset.asset_url} alt=""/><b>{asset.name}</b><small>{owned ? asset.rarity + (asset.animation_type !== "none" ? " · Animado" : "") : "Bloqueado"}</small>
          </button>;
        })}</div>}
        {profileAssetTab === "decoration" && <div className="profile-asset-grid">
          <button type="button" className={"profile-asset-option profile-asset-none" + (!selectedDecorationAssetId ? " selected" : "")} onClick={() => setSelectedDecorationAssetId(null)}><span>∅</span><b>Sem decoração</b><small>Limpo</small></button>
          {profileAssets.filter((asset) => asset.asset_type === "avatar_decoration").map((asset) => {
            const owned = profileInventoryIds.includes(asset.id);
            return <button type="button" key={asset.id} disabled={!owned} className={"profile-asset-option" + (selectedDecorationAssetId === asset.id ? " selected" : "")} onClick={() => setSelectedDecorationAssetId(asset.id)}>
              <span className="decoration-preview"><img src={avatarPreview || selectedAvatarAsset?.asset_url || currentAvatarUrl || "/profile-assets/avatars/fox.svg"} alt=""/><img className={`decoration-preview-frame ${getProfileAnimationClass(asset.animation_type)}`} style={getDecorationFitStyle(asset)} src={asset.asset_url} alt=""/></span><b>{asset.name}</b><small>{owned ? asset.rarity + (asset.animation_type !== "none" ? " · Animada" : "") : "Bloqueado"}</small>
            </button>;
          })}
        </div>}
        {profileAssetTab === "banner" && <div className="profile-asset-grid banner-asset-grid">
          <button type="button" className={"profile-asset-option profile-asset-none" + (!selectedBannerAssetId ? " selected" : "")} onClick={() => setSelectedBannerAssetId(null)}><span>∅</span><b>Sem banner</b><small>Limpo</small></button>
          {profileAssets.filter((asset) => asset.asset_type === "banner").map((asset) => {
            const owned = profileInventoryIds.includes(asset.id);
            return <button type="button" key={asset.id} disabled={!owned} className={"profile-asset-option" + (selectedBannerAssetId === asset.id ? " selected" : "")} onClick={() => setSelectedBannerAssetId(asset.id)}>
              <img className={`profile-banner-option ${getProfileAnimationClass(asset.animation_type)}`} src={asset.asset_url} alt=""/><b>{asset.name}</b><small>{owned ? asset.rarity + (asset.animation_type !== "none" ? " · Animado" : "") : "Bloqueado"}</small>
            </button>;
          })}
        </div>}
        {profileAssetTab === "badge" && <div className="profile-asset-grid badge-asset-grid">{profileAssets.filter((asset) => asset.asset_type === "badge").map((asset) => {
          const unlocked = profileInventoryIds.includes(asset.id);
          const badge = profileBadges.find((item) => item.asset_id === asset.id);
          return <button type="button" key={asset.id} disabled={!unlocked} className={"profile-asset-option" + (badge?.is_featured ? " selected" : "")} onClick={() => void toggleProfileBadge(asset.id)}>
            <img src={asset.asset_url} alt=""/><b>{asset.name}</b><small>{!unlocked ? "Bloqueada" : badge?.is_featured ? "Destacada no perfil" : "Desbloqueada · toque para destacar"}</small>
          </button>;
        })}</div>}
        <p className="profile-gallery-note">Itens iniciais gratuitos. Insígnias especiais serão desbloqueadas por conquistas na comunidade.</p>
      </div>
      <label className="profile-form-label">Nome de exibição<input value={editName} maxLength={60} onChange={(e) => setEditName(e.target.value)} placeholder="Seu nome"/></label>
      <label className="profile-form-label">Nome de usuário<input value={editUsername} maxLength={24} onChange={(e) => setEditUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())} placeholder="seuusuario"/><small>3 a 24 caracteres; letras, números e _</small></label>
      <label className="profile-form-label">Bio<textarea value={editBio} maxLength={160} onChange={(e) => setEditBio(e.target.value)} placeholder="Conte um pouco sobre você..." rows={3}/><small>{editBio.length}/160</small></label>
      <button className="primary-button profile-save-button" disabled={profileSaving} onClick={saveProfile}>{profileSaving ? "Salvando..." : "Salvar alterações"} <Check size={16}/></button>
    </div></div>}
    {composer && <div className="modal-backdrop" onClick={() => !publishing && setComposer(false)}><div className="composer-modal feed-composer" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h2>Nova publicação</h2><button className="icon-button" onClick={() => setComposer(false)} disabled={publishing}><X size={19}/></button></div><textarea value={postText} maxLength={2200} onChange={(e) => setPostText(e.target.value)} placeholder="Compartilhe uma descoberta com a comunidade..."/><label className="post-image-picker"><Camera size={17}/> {postImage ? "Trocar imagem" : "Adicionar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => choosePostImage(e.target.files?.[0])}/></label>{postImagePreview && <div className="post-preview"><img src={postImagePreview} alt="Prévia"/><button onClick={() => {setPostImage(null);setPostImagePreview("");}}>Remover foto</button></div>}<label className="profile-form-label">Local ou estabelecimento (opcional)<input value={postLocation} maxLength={120} onChange={(e) => setPostLocation(e.target.value)} placeholder="Ex.: Café no centro de Teresina"/></label><div className="composer-footer"><small>{postText.length}/2200 · Foto até 8 MB</small><button className="primary-button" disabled={publishing || (!postText.trim() && !postImage)} onClick={() => void publish()}>{publishing ? "Publicando..." : "Publicar"} <ArrowRight size={16}/></button></div></div></div>}
    {editingPost && <div className="modal-backdrop" onClick={closeEditPost}><div className="composer-modal feed-composer edit-post-modal" role="dialog" aria-modal="true" aria-labelledby="edit-post-title" onClick={(e) => e.stopPropagation()}>
      <div className="modal-head"><h2 id="edit-post-title">Editar publicação</h2><button className="icon-button" onClick={closeEditPost} disabled={savingPostEdit} aria-label="Fechar"><X size={19}/></button></div>
      <textarea value={editPostText} maxLength={2200} onChange={(e) => setEditPostText(e.target.value)} placeholder="Compartilhe uma descoberta com a comunidade..."/>
      <label className="post-image-picker"><Camera size={17}/> {editPostImagePreview ? "Trocar imagem" : "Adicionar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => chooseEditPostImage(e.target.files?.[0])}/></label>
      {editPostImagePreview && <div className="post-preview"><img src={editPostImagePreview} alt="Prévia da foto da publicação"/><button type="button" disabled={savingPostEdit} onClick={() => { if (editPostImagePreview.startsWith("blob:")) URL.revokeObjectURL(editPostImagePreview); setEditPostImage(null); setEditPostImagePreview(""); setRemoveEditPostImage(true); }}>Remover foto</button></div>}
      <label className="profile-form-label">Local ou estabelecimento (opcional)<input value={editPostLocation} maxLength={120} onChange={(e) => setEditPostLocation(e.target.value)} placeholder="Ex.: Café no centro de Teresina"/></label>
      <div className="composer-footer"><small>{editPostText.length}/2200 · Foto até 8 MB</small><button className="primary-button" disabled={savingPostEdit || (!editPostText.trim() && !editPostImagePreview)} onClick={() => void savePostEdit()}>{savingPostEdit ? "Salvando..." : "Salvar alterações"} <Check size={16}/></button></div>
    </div></div>}
    {postToDelete && <div className="modal-backdrop" onClick={() => deletingPostId !== postToDelete.id && setPostToDelete(null)}><div className="composer-modal delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-post-title" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h2 id="delete-post-title">Excluir publicação?</h2><button className="icon-button" onClick={() => setPostToDelete(null)} disabled={deletingPostId === postToDelete.id} aria-label="Fechar"><X size={19}/></button></div><p>Essa ação não pode ser desfeita. As curtidas e os comentários desta publicação também serão removidos.</p><div className="delete-confirm-actions"><button type="button" className="cancel-delete-button" onClick={() => setPostToDelete(null)} disabled={deletingPostId === postToDelete.id}>Cancelar</button><button type="button" className="danger-delete-button" onClick={() => void deletePost()} disabled={deletingPostId === postToDelete.id}>{deletingPostId === postToDelete.id ? "Excluindo..." : "Excluir publicação"} <Trash2 size={15}/></button></div></div></div>}
    {commentsPost && <div className="modal-backdrop" onClick={() => setCommentsPost(null)}><div className="composer-modal comments-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h2>Comentários</h2><button className="icon-button" onClick={() => setCommentsPost(null)}><X size={19}/></button></div><div className="comments-list">{commentsLoading ? <p>Carregando comentários...</p> : comments.length ? comments.map((comment) => <div className="comment-item" key={comment.id}><b>{comment.author?.display_name || "Explorador ZORVI"}</b><p>{comment.content}</p><small>{new Date(comment.created_at).toLocaleString("pt-BR")}</small></div>) : <p className="comments-empty">Seja a primeira pessoa a comentar.</p>}</div><form className="comment-form" onSubmit={(e) => {e.preventDefault();void sendComment();}}><input value={commentText} onChange={(e) => setCommentText(e.target.value)} maxLength={1000} placeholder="Escreva um comentário..."/><button className="primary-button" disabled={commentSending || !commentText.trim()}><Send size={16}/></button></form></div></div>}
    {priceReportOpen && <div className="modal-backdrop" onClick={() => !priceReportSubmitting && setPriceReportOpen(false)}>
      <div className="composer-modal feed-composer price-report-modal" role="dialog" aria-modal="true" aria-labelledby="price-report-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head"><h2 id="price-report-title">Informar preço</h2><button className="icon-button" onClick={() => setPriceReportOpen(false)} disabled={priceReportSubmitting} aria-label="Fechar"><X size={19}/></button></div>
        <div className="price-report-product"><small>PRODUTO SELECIONADO</small><b>{selectedPriceProduct?.name}</b><span>{[selectedPriceProduct?.brand,selectedPriceProduct?.variant,selectedPriceProduct?.unit].filter(Boolean).join(" · ")}</span></div>
        <label className="profile-form-label">Estabelecimento
          <select value={priceReportStoreId} onChange={(event) => setPriceReportStoreId(event.target.value)}>
            {(mapStores.length ? mapStores : nearbyStores).filter((store) => store.category === selectedPriceProduct?.category).map((store) => <option key={store.id} value={store.id}>{store.brand_name || store.name} · {store.address}</option>)}
          </select>
        </label>
        <label className="profile-form-label">Preço observado (R$)
          <input type="text" inputMode="decimal" maxLength={12} value={priceReportValue} onChange={(event) => setPriceReportValue(event.target.value.replace(/[^0-9,.]/g, ""))} placeholder="Ex.: 12,99"/>
        </label>
        <label className="profile-form-label">Disponibilidade na loja
          <select value={priceReportAvailability} onChange={(event) => setPriceReportAvailability(event.target.value as "available"|"unavailable"|"unknown")}>
            <option value="unknown">Não sei / não confirmei</option>
            <option value="available">Estava disponível</option>
            <option value="unavailable">Estava sem estoque</option>
          </select>
        </label>
        <label className="profile-form-label">Link da oferta ou página oficial (opcional)
          <input type="url" value={priceReportSourceUrl} onChange={(event) => setPriceReportSourceUrl(event.target.value)} placeholder="https://..."/>
        </label>
        <p className="price-report-note">Seu envio ficará pendente de validação. Só será mostrado como preço confirmado depois de uma revisão.</p>
        <button type="button" className="primary-button profile-save-button" disabled={priceReportSubmitting || !priceReportValue.trim() || !priceReportStoreId} onClick={() => void submitPriceReport()}>{priceReportSubmitting ? "Enviando..." : "Enviar para validação"} <ArrowRight size={16}/></button>
      </div>
    </div>}
    {showSplash && <div className="zorvi-splash" aria-label="ZORVI"><img src="/zorvi-mark.webp" alt="" /><div className="splash-word">ZORVI</div><p>Tudo se conecta. Tudo se descobre.</p><span className="splash-loader" /></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "ZORVI — Tudo se conecta. Tudo se descobre." }, { name: "description", content: "Descubra lugares, pessoas, produtos e experiências com a ZORVI." }, { name: "theme-color", content: "#080610" }] }),
  component: App,
});
