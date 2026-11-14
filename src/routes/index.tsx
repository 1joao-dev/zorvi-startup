import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { AuthScreen } from "@/components/AuthScreen";
import { ArrowRight, Bell, Bookmark, Camera, Check, Compass, Heart, Home, MapPin, LocateFixed, MessageCircle, Moon, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Send, Settings2, Share2, ShoppingBag, Sparkles, Sun, Trash2, UserRound, Utensils, Wallet, X, Zap } from "lucide-react";

type Tab = "home" | "map" | "ai" | "search" | "profile";
type UserProfile = { id: string; username: string | null; display_name: string; avatar_url: string | null; bio: string | null };
type FeedPost = { id: string; user_id: string; content: string; image_url: string | null; location_name: string | null; created_at: string; author: UserProfile | null; likes_count: number; comments_count: number; liked: boolean };
type FeedComment = { id: string; content: string; created_at: string; user_id: string; author: UserProfile | null };
type Store = { id:string; name:string; category:string; address:string; city:string; state:string; latitude:number|null; longitude:number|null; website_url:string|null; brand_name:string|null; brand_slug:string|null; brand_logo_url:string|null; coordinate_precision:string|null; coordinate_source:string|null; geocoded_at:string|null; geocode_attempted_at:string|null };
type UserLocation = { lat:number; lon:number; accuracy:number|null; precision:"precise"|"approximate"|"manual" };
type MapStore = Store & { distance:number|null; mapPrice?:number|null; mapPriceType?:string|null; mapPriceObservedAt?:string|null; mapPriceSource?:string|null; mapProductLabel?:string|null };
type PriceResult = { id:string; price:number; price_type:string; source_url:string|null; source_label:string; observed_at:string; availability_status:string; store:Store; product:{id:string;name:string;brand:string|null;variant:string|null;unit:string|null;category:string} };
type LeafletMap = { setView(center:[number,number],zoom:number):LeafletMap; fitBounds(bounds:Array<[number,number]>,options?:Record<string,unknown>):LeafletMap; on(event:string,handler:(event:{latlng:{lat:number;lng:number}})=>void):LeafletMap; remove():void; invalidateSize():void };
type LeafletCircle = { addTo(layer:LeafletLayerGroup):LeafletCircle };
type LeafletLayerGroup = { clearLayers():void; addTo(map:LeafletMap):LeafletLayerGroup };
type LeafletMarker = { addTo(layer:LeafletLayerGroup):LeafletMarker; bindPopup(html:string):LeafletMarker; on(event:string,handler:()=>void):LeafletMarker };
type LeafletApi = { map(container:HTMLElement,options?:Record<string,unknown>):LeafletMap; tileLayer(url:string,options?:Record<string,unknown>):{addTo(map:LeafletMap):void}; layerGroup():LeafletLayerGroup; divIcon(options:Record<string,unknown>):unknown; marker(coords:[number,number],options?:Record<string,unknown>):LeafletMarker; circle(coords:[number,number],options:Record<string,unknown>):LeafletCircle };
declare global { interface Window { L?:LeafletApi } }
let leafletLoader:Promise<LeafletApi>|null=null;
function ensureLeaflet():Promise<LeafletApi>{
  if(typeof window==="undefined")return Promise.reject(new Error("Mapa indisponível neste ambiente."));
  if(window.L)return Promise.resolve(window.L);
  if(!leafletLoader){
    leafletLoader=new Promise((resolve,reject)=>{
      if(!document.querySelector('link[data-zorvi-leaflet]')){
        const link=document.createElement("link");link.rel="stylesheet";link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";link.dataset.zorviLeaflet="true";document.head.appendChild(link);
      }
      const loaded=()=>window.L?resolve(window.L):reject(new Error("Não foi possível inicializar o mapa."));
      const existing=document.querySelector<HTMLScriptElement>('script[data-zorvi-leaflet]');
      if(existing){existing.addEventListener("load",loaded,{once:true});existing.addEventListener("error",()=>reject(new Error("Falha ao carregar o mapa.")),{once:true});return;}
      const script=document.createElement("script");script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";script.async=true;script.dataset.zorviLeaflet="true";script.onload=loaded;script.onerror=()=>{script.remove();reject(new Error("Falha ao carregar o mapa."));};document.head.appendChild(script);
    }).catch(error=>{document.querySelector('script[data-zorvi-leaflet]')?.remove();leafletLoader=null;throw error;});
  }
  return leafletLoader;
}
function formatMapPrice(value:number){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value);}
function escapeMapHtml(value:string){const entities:Record<string,string>={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};return value.replace(/[&<>"']/g,char=>entities[char]||char);}
function getStoreBrand(store:Pick<Store,"name"|"brand_name"|"brand_slug"|"category">){
  const name=store.brand_name||store.name.split(" - ")[0].split(" — ")[0];
  const slug=store.brand_slug||(name.toLowerCase().includes("drogasil")?"drogasil":name.toLowerCase().includes("globo")?"globo":name.toLowerCase().includes("pague menos")?"pague-menos":"");
  const initials=slug==="pague-menos"?"PM":slug==="globo"?"G":slug==="drogasil"?"D":slug==="pao-de-acucar"?"P":slug==="atacadao"?"A":slug==="carvalho"?"C":slug==="ferreira"?"F":slug==="mix-atacarejo"?"MIX":name.trim().charAt(0).toUpperCase()||"L";
  const color=slug==="drogasil"?"#E52B36":slug==="globo"?"#0B9DD9":slug==="pague-menos"?"#E95B28":slug==="pao-de-acucar"?"#F0B323":slug==="atacadao"?"#E53935":slug==="carvalho"?"#16834A":slug==="ferreira"?"#2873B8":slug==="mix-atacarejo"?"#E58A18":store.category==="Mercado"?"#159A63":store.category==="Restaurante"?"#D97706":"#7200FF";
  return {name,slug,initials,color};
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

// CARTO Dark Matter is served without a client API key. Keep attribution visible.
const MAP_TILE_URL = "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const MAP_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>';

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
  useEffect(() => {
    if (!session?.user.id || !supabase) { setProfile(null); return; }
    let active = true;
    setProfileLoading(true);
    supabase.from("profiles").select("id, username, display_name, avatar_url, bio").eq("id", session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) notify(error.message);
        else if (data) setProfile(data as UserProfile);
        setProfileLoading(false);
      });
    return () => { active = false; };
  }, [session?.user.id]);
  const openProfileEditor = () => {
    setEditName(profile?.display_name || accountName);
    setEditUsername(profile?.username || "");
    setEditBio(profile?.bio || "");
    setAvatarFile(null);
    setAvatarPreview(profile?.avatar_url || "");
    setEditProfileOpen(true);
  };
  const chooseAvatar = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { notify("Use uma imagem JPG, PNG ou WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { notify("A imagem deve ter no máximo 5 MB."); return; }
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
      }
      const update = { id: session.user.id, display_name: cleanName, username: cleanUsername, bio: editBio.trim(), avatar_url: avatarUrl, updated_at: new Date().toISOString() };
      const { data, error } = await supabase.from("profiles").update(update).eq("id", session.user.id).select("id, username, display_name, avatar_url, bio").single();
      if (error) throw error;
      setProfile(data as UserProfile);
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
  const signOut = async () => { if (supabase) { const { error } = await supabase.auth.signOut(); if (error) notify(error.message); else notify("Você saiu da sua conta."); } };
  const [dark, setDark] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [userLocation, setUserLocation] = useState<UserLocation|null>(null);
const [locationStatus, setLocationStatus] = useState("Ative o GPS para encontrar lojas próximas.");
  const [manualLocationPicking, setManualLocationPicking] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeError, setStoreError] = useState("");
  const [priceResults, setPriceResults] = useState<PriceResult[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [geocodingStores, setGeocodingStores] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [searchProductCategory, setSearchProductCategory] = useState<string|null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState("");
  const [mapInstanceKey, setMapInstanceKey] = useState(0);
  const [selectedMapStore, setSelectedMapStore] = useState<MapStore|null>(null);
  const mapContainerRef = useRef<HTMLDivElement|null>(null);
  const leafletMapRef = useRef<LeafletMap|null>(null);
const leafletMarkerLayerRef = useRef<LeafletLayerGroup|null>(null);
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
  const [chat, setChat] = useState([{ role: "assistant", text: "Oi! ✨ Sou a ZORVI AI. Posso ajudar você a descobrir lugares, comparar opções e encontrar experiências. O que vamos explorar hoje?" }]);
  const [toast, setToast] = useState("");
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(""), 2300); };
  const send = (value: string) => {
    if (!value.trim()) return;
    setChat((old) => [...old, { role: "user", text: value }, { role: "assistant", text: "Boa pergunta! Esta é uma prévia da ZORVI AI. Quando conectarmos os dados reais e a inteligência artificial, vou poder comparar opções perto de você. Por enquanto, explore os locais demonstrativos no mapa." }]);
    setMessage("");
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
      setUserLocation(null);
      setLocationStatus("Este navegador não oferece localização. Escolha um ponto manualmente no mapa.");
      return;
    }
    setUserLocation(null);
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
          setUserLocation(null);
          setLocationStatus(`O GPS retornou uma posição muito imprecisa (${accuracyLabel}). Tente novamente ou escolha um ponto no mapa.`);
          return;
        }
        const precision = accuracy <= 100 ? "precise" : "approximate";
        setUserLocation({ lat: latitude, lon: longitude, accuracy, precision });
        setLocationStatus(
          precision === "precise"
            ? `GPS confirmado · precisão de ±${Math.round(accuracy)} m`
            : `Localização aproximada · margem de erro de ±${Math.round(accuracy)} m. Distâncias estimadas.`
        );
      },
      (error) => {
        setUserLocation(null);
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
  }, []);

  const loadNearbyStores = useCallback(async () => {
    if (!supabase) return;
    setCatalogLoading(true);
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name,category,address,city,state,latitude,longitude,website_url,brand_name,brand_slug,brand_logo_url,coordinate_precision,coordinate_source,geocoded_at,geocode_attempted_at")
        .eq("verification_status", "verified")
        .limit(500);
      if (error) throw error;
      setStores((data || []) as Store[]);
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
  }, []);

  useEffect(() => {
    if (tab === "map") void loadNearbyStores();
  }, [tab, loadNearbyStores]);

  const nearbyStores = useMemo(
    () => stores
      .filter((store) => filter === "Todos" || store.category === filter)
      .map((store) => ({
        ...store,
        distance: userLocation && store.latitude !== null && store.longitude !== null
          ? distanceKm(userLocation.lat, userLocation.lon, store.latitude, store.longitude)
          : null,
      }))
      .filter((store) => store.distance === null || store.distance <= 20)
      .sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999)),
    [stores, filter, userLocation]
  );

  const mapStores = useMemo<MapStore[]>(() => {
    const relevantStores = nearbyStores.filter(store => !searchPerformed || !searchProductCategory || store.category === searchProductCategory);
    if (!searchPerformed) return relevantStores;
    const bestByStore = new Map<string,PriceResult>();
    priceResults.forEach(result => {
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

  const geocodeStores = useCallback(async (silent = false) => {
    if (!supabase || geocodingStores) return;
    setGeocodingStores(true);
    try {
      let totalUpdated = 0;
      let totalProcessed = 0;
      let totalNotLocated = 0;
      let totalFailed = 0;
      let previousRemaining = Number.POSITIVE_INFINITY;

      // Each Edge Function call processes a rate-limited batch of five addresses.
      // Sequential batches let the map fill itself without requiring a manual action.
      for (let round = 0; round < 10; round += 1) {
        const { data, error } = await supabase.functions.invoke("geocode-stores", {
          body: { category: filter === "Todos" ? null : filter },
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
        totalNotLocated += Array.isArray(data?.notLocated) ? data.notLocated.length : 0;
        totalFailed += Array.isArray(data?.failed) ? data.failed.length : 0;

        if (processed === 0 || remaining === 0 || remaining >= previousRemaining) break;
        previousRemaining = remaining;
      }

      await loadNearbyStores();
      if (!silent) {
        if (totalUpdated > 0) {
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
    const hasPendingCoordinates = stores.some((store) => store.latitude === null || store.longitude === null);
    if (!hasPendingCoordinates) return;
    autoGeocodeStartedRef.current = true;
    void geocodeStores(true);
  }, [tab, catalogLoading, stores, geocodingStores, geocodeStores]);

  const searchPrices = async () => {
    if (!supabase || !query.trim()) return;
    setCatalogLoading(true);
    setSearchPerformed(true);
    try {
      const { data: products, error } = await supabase
        .from("products")
        .select("id,name,brand,variant,unit,category")
        .ilike("normalized_name", "%" + query.trim() + "%")
        .limit(20);
      if (error) throw error;

      const productIds = (products || []).map((product) => product.id);
      setSearchProductCategory(products?.[0]?.category || null);
      if (products?.[0]?.category) setFilter(products[0].category);
      if (!productIds.length) {
        setPriceResults([]);
        setSearchProductCategory(null);
        return;
      }

      const { data, error: priceError } = await supabase
        .from("price_observations")
        .select("id,product_id,store_id,price,price_type,source_url,source_label,observed_at,availability_status,stores(id,name,category,address,city,state,latitude,longitude,website_url,brand_name,brand_slug,brand_logo_url,coordinate_precision,coordinate_source,geocoded_at,geocode_attempted_at),products(id,name,brand,variant,unit,category)")
        .in("product_id", productIds)
        .eq("verification_status", "verified")
        .gte("observed_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .neq("availability_status", "unavailable")
        .order("price", { ascending: true })
        .limit(100);
      if (priceError) throw priceError;

      type PriceJoin = Omit<PriceResult, "store" | "product"> & {
        stores: Store | null;
        products: PriceResult["product"] | null;
      };
      const joinedRows = ((data || []) as unknown as PriceJoin[]).map(
        ({ stores: store, products: product, ...price }) => ({ ...price, store, product })
      );
      const verifiedRows = joinedRows.filter(
        (row): row is PriceResult =>
          Boolean(row.store && row.product)
          && (!products?.[0]?.category || row.store.category === products[0].category)
          && (!userLocation || row.store!.latitude === null || row.store!.longitude === null || distanceKm(
            userLocation.lat,
            userLocation.lon,
            row.store!.latitude,
            row.store!.longitude
          ) <= 20)
      );
      verifiedRows.sort((a, b) => Number(a.price) - Number(b.price));
      setPriceResults(verifiedRows);
    } catch (error) {
      setPriceResults([]);
      notify(
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message || "")
          : "Erro ao comparar preços."
      );
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== "map") return;
    let active = true;
    setMapLoadError("");
    void ensureLeaflet().then((leaflet) => {
      if (!active || !mapContainerRef.current) return;
      if (!leafletMapRef.current) {
        const map = leaflet.map(mapContainerRef.current, { zoomControl: true, scrollWheelZoom: false });
        map.setView([-5.0892, -42.8016], 13);
        map.on("click", (event) => {
          if (!manualLocationPickingRef.current) return;
          const latitude = Number(event.latlng.lat);
          const longitude = Number(event.latlng.lng);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
          setUserLocation({ lat: latitude, lon: longitude, accuracy: null, precision: "manual" });
          setLocationStatus("Ponto escolhido manualmente no mapa · não é uma posição GPS.");
          manualLocationPickingRef.current = false;
          setManualLocationPicking(false);
        });
        leaflet.tileLayer(MAP_TILE_URL, {
          maxZoom: 19,
          attribution: MAP_TILE_ATTRIBUTION,
        }).addTo(map);
        leafletMapRef.current = map;
        leafletMarkerLayerRef.current = leaflet.layerGroup().addTo(map);
      }
      setMapReady(true);
      window.setTimeout(() => leafletMapRef.current?.invalidateSize(), 120);
    }).catch((error:unknown) => {
      if (active) setMapLoadError(error instanceof Error ? error.message : "Não foi possível carregar o mapa.");
    });
    return () => {
      active = false;
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      leafletMarkerLayerRef.current = null;
      setMapReady(false);
      setSelectedMapStore(null);
    };
  }, [tab, mapInstanceKey]);

  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;
    if (userLocation) {
      leafletMapRef.current.setView([userLocation.lat, userLocation.lon], userLocation.precision === "approximate" && (userLocation.accuracy || 0) > 1000 ? 12 : userLocation.precision === "approximate" ? 14 : 15);
    } else {
      // Without a sufficiently accurate GPS fix, show the city reference point,
      // never a guessed device location.
      leafletMapRef.current.setView([-5.0892, -42.8016], 13);
    }
  }, [mapReady, userLocation]);

  useEffect(() => {
    const leaflet = window.L;
    const markerLayer = leafletMarkerLayerRef.current;
    if (!mapReady || !leaflet || !markerLayer) return;
    markerLayer.clearLayers();

    mapStores.forEach((store) => {
      if (store.latitude === null || store.longitude === null) return;
      const brand = getStoreBrand(store);
      const hasPrice = typeof store.mapPrice === "number";
      const logoUrl = store.brand_logo_url && /^https?:\/\//i.test(store.brand_logo_url)
        ? escapeMapHtml(store.brand_logo_url)
        : "";
      const categoryGlyph = store.category === "Farmácia"
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
        : store.category === "Mercado"
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18l-1.5 11h-15L3 9ZM5 9l2-5h10l2 5M9 13v3M15 13v3"/></svg>'
          : store.category === "Restaurante"
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 3v18M17 3c4 3 4 7 0 9"/></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h18v10H3zM5 10V5h14v5M8 14h8"/></svg>';
      const logoMarkup = logoUrl
        ? `<img src="${logoUrl}" alt="" referrerpolicy="no-referrer" onerror="this.remove()" />`
        : "";
      const selectedClass = selectedMapStore?.id === store.id ? " is-selected" : "";
      const markerHtml = `<div class="zorvi-map-marker${searchPerformed ? " with-price" : ""}${selectedClass}" style="--brand-accent:${brand.color}">
        <span class="zorvi-map-marker-symbol"><b>${escapeMapHtml(brand.initials)}</b>${logoMarkup}
          <i class="zorvi-map-marker-category">${categoryGlyph}</i>
        </span>
        ${searchPerformed ? `<span class="zorvi-map-marker-price ${hasPrice ? "is-price" : "no-price"}">${hasPrice ? `${store.mapPriceType === "estimated" ? "≈ " : ""}${formatMapPrice(store.mapPrice as number)}` : "Sem preço"}</span>` : ""}
      </div>`;
      const icon = leaflet.divIcon({
        className: "zorvi-leaflet-icon",
        html: markerHtml,
        iconSize: searchPerformed ? [74, 58] : [42, 42],
        iconAnchor: searchPerformed ? [37, 53] : [21, 21],
        popupAnchor: [0, searchPerformed ? -50 : -22],
      });
      const marker = leaflet.marker([store.latitude, store.longitude], { icon }).addTo(markerLayer);
      const priceMarkup = hasPrice
        ? `<strong class="zorvi-popup-price">${store.mapPriceType === "estimated" ? "Estimativa · " : "Preço verificado · "}${formatMapPrice(store.mapPrice as number)}</strong><small>${escapeMapHtml(store.mapProductLabel || query)}</small>`
        : searchPerformed ? '<strong class="zorvi-popup-no-price">Preço não confirmado</strong>' : "";
      const coordinateMarkup = store.coordinate_precision === "street" ? "<small>Localização aproximada na via</small>" : store.coordinate_precision === "address" ? "<small>Endereço geocodificado</small>" : "";
      const updatedMarkup = store.mapPriceObservedAt
        ? `<small>Atualizado em ${escapeMapHtml(new Date(store.mapPriceObservedAt).toLocaleString("pt-BR"))}</small>`
        : "";
      const popupHtml = `<div class="zorvi-map-popup"><b>${escapeMapHtml(store.name)}</b><small>${escapeMapHtml(store.address)}, ${escapeMapHtml(store.city)}</small>${priceMarkup}${coordinateMarkup}${updatedMarkup}${store.website_url ? `<a href="${escapeMapHtml(store.website_url)}" target="_blank" rel="noreferrer">Site da loja</a>` : ""}</div>`;
      marker.bindPopup(popupHtml);
      marker.on("click", () => setSelectedMapStore(store));
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
          color: "#b77aff",
          weight: 1.5,
          opacity: 0.85,
          fillColor: "#9b35ff",
          fillOpacity: 0.13,
          interactive: false,
        }).addTo(markerLayer);
      }
      const youIcon = leaflet.divIcon({
        className: "zorvi-user-location-icon",
        html: '<span class="zorvi-user-location-dot"><i></i></span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      leaflet.marker([userLocation.lat, userLocation.lon], { icon: youIcon })
        .addTo(markerLayer)
        .bindPopup(userLocation.precision === "precise" ? "<b>GPS confirmado</b>" : userLocation.precision === "approximate" ? `<b>GPS aproximado</b><small>Margem de erro: ±${Math.round(userLocation.accuracy || 0)} m</small>` : "<b>Ponto escolhido manualmente</b>");
    }
  }, [mapReady, mapStores, userLocation, searchPerformed, query, locationStatus, selectedMapStore]);

  if (isSupabaseConfigured && authLoading) return <div className="zorvi-auth-loading"><img src="/zorvi-mark.webp" alt="ZORVI"/><span>Preparando sua experiência...</span></div>;
  if (isSupabaseConfigured && !session) return <AuthScreen />;

  return <div className={"zorvi-app " + (dark ? "theme-dark" : "theme-light")}>
    <div className="app-shell">
      <header className="topbar">
        <div><div className="brand"><img className="brand-mark-image" src="/zorvi-mark.webp" alt="Símbolo ZORVI" /><span>ZORVI</span></div><p className="tagline">Tudo se conecta. Tudo se descobre.</p></div>
        <div className="top-actions"><button className="icon-button" onClick={() => setDark(!dark)} aria-label="Alternar tema">{dark ? <Sun size={19}/> : <Moon size={19}/>}</button><button className="icon-button" onClick={() => notify("Nenhuma notificação nova")} aria-label="Notificações"><Bell size={19}/></button><button className="avatar avatar-top" onClick={() => setTab("profile")}>{profile?.avatar_url ? <img src={profile.avatar_url} alt="Sua foto de perfil"/> : accountInitial}</button></div>
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
              <input value={query} onChange={e=>{setQuery(e.target.value);setSearchPerformed(false);setSearchProductCategory(null);setPriceResults([]);setSelectedMapStore(null);}} onKeyDown={e=>{if(e.key==="Enter")void searchPrices();}} placeholder="Qual produto você procura?" aria-label="Buscar produto"/>
              {query && <button onClick={()=>{setQuery("");setSearchPerformed(false);setSearchProductCategory(null);setPriceResults([]);setSelectedMapStore(null);}} aria-label="Limpar busca"><X size={16}/></button>}
            </div>
            <button className="primary-button price-search-button" disabled={catalogLoading||!query.trim()} onClick={()=>void searchPrices()}>
              {catalogLoading ? <span className="map-button-loading"/> : <Search size={16}/>}
              <span>{catalogLoading ? "Buscando" : "Comparar"}</span>
            </button>
          </div>

          <div className="map-location-bar">
            <div className={"map-location-indicator" + (userLocation ? " is-active" : "")} title={locationStatus}>
              <span className="map-location-indicator-dot"/>
              <span className="map-location-copy">
                <b>{userLocation ? userLocation.precision === "precise" ? "GPS confirmado" : userLocation.precision === "approximate" ? "GPS aproximado" : "Ponto manual" : locationStatus.startsWith("Buscando") ? "Buscando GPS" : "Localização"}</b>
                <small>{userLocation ? userLocation.precision === "manual" ? "Ponto escolhido no mapa" : "Precisão de ±" + Math.round(userLocation.accuracy || 0) + " m" : locationStatus}</small>
              </span>
            </div>
            <div className="map-location-actions">
              <button onClick={requestLocation}><LocateFixed size={15}/> GPS</button>
              <button className={manualLocationPicking ? "manual-location-active" : ""} onClick={() => { const next = !manualLocationPicking; manualLocationPickingRef.current = next; setManualLocationPicking(next); setLocationStatus(next ? "Toque no mapa para escolher sua localização manualmente." : "Seleção manual encerrada. Use o GPS ou escolha outro ponto."); }}>{manualLocationPicking ? "Cancelar" : "No mapa"}</button>
            </div>
          </div>

          <div className="filter-row map-filter-row" aria-label="Filtrar estabelecimentos">
            {["Todos","Farmácia","Mercado","Restaurante","Lojas"].map(f=><button key={f} className={filter===f?"filter-chip selected":"filter-chip"} onClick={()=>{setFilter(f);setSelectedMapStore(null);}}>{f}</button>)}
          </div>

          <div className="zorvi-map-frame">
            <div className="zorvi-map-topline">
              <span><i className="map-live-indicator"/> MAPA INTERATIVO</span>
              <span>{mapStores.filter(store=>store.latitude!==null&&store.longitude!==null).length + (userLocation ? 1 : 0)} pontos</span>
            </div>
            <div ref={mapContainerRef} className={"zorvi-leaflet-map" + (manualLocationPicking ? " is-picking" : "")} aria-label="Mapa interativo de estabelecimentos e preços"/>
            {!mapReady&&!mapLoadError&&<div className="zorvi-map-overlay"><span className="map-loading-spinner"/><b>Preparando seu mapa...</b><span>Carregando ruas e estabelecimentos</span></div>}
            {mapLoadError&&<div className="zorvi-map-overlay map-load-error"><b>Não foi possível carregar o mapa.</b><span>{mapLoadError}</span><button onClick={()=>setMapInstanceKey(value=>value+1)}>Tentar novamente</button></div>}
            {manualLocationPicking&&<div className="map-picking-hint">Toque no mapa para marcar sua localização</div>}
            <button className="zorvi-map-gps" onClick={requestLocation} aria-label="Centralizar na minha localização"><LocateFixed size={19}/></button>
            <div className="zorvi-map-legend"><span><i className="legend-pharmacy"/> Farmácias</span><span><i className="legend-market"/> Mercados</span><span><i className="legend-other"/> Outros</span></div>
          </div>

          <section className={"map-results-sheet" + (selectedMapStore ? " has-selection" : "")} aria-label="Estabelecimentos próximos">
            <div className="map-sheet-handle"/>
            <div className="map-sheet-header">
              <div>
                <p className="eyebrow">{searchPerformed ? "RESULTADOS DA BUSCA" : "AO SEU REDOR"}</p>
                <h2>{mapStores.length} {mapStores.length === 1 ? "local próximo" : "locais próximos"}</h2>
              </div>
              <button className="map-sheet-refresh" onClick={() => void loadNearbyStores()}><RefreshCw size={14}/> Atualizar</button>
            </div>

            {selectedMapStore && <div className="map-selected-store">
              <span className="store-brand-mini" style={{"--brand-accent":getStoreBrand(selectedMapStore).color} as CSSProperties}><b>{getStoreBrand(selectedMapStore).initials}</b>{selectedMapStore.brand_logo_url&&<img src={selectedMapStore.brand_logo_url} alt="" onError={event=>event.currentTarget.remove()}/>}</span>
              <div className="place-info">
                <b>{selectedMapStore.brand_name||selectedMapStore.name}</b>
                <small>{selectedMapStore.address} · {selectedMapStore.city}</small>
                {typeof selectedMapStore.mapPrice==="number" ? <strong>{selectedMapStore.mapPriceType==="estimated"?"Estimativa · ":"Preço confirmado · "}{formatMapPrice(selectedMapStore.mapPrice)}</strong> : searchPerformed ? <small>Preço ainda não confirmado para esta unidade.</small> : <small>{selectedMapStore.distance===null?"Coordenada pendente":selectedMapStore.distance.toFixed(1)+" km de você"}</small>}
              </div>
              {selectedMapStore.website_url&&<a href={selectedMapStore.website_url} target="_blank" rel="noreferrer">Site</a>}
              <button className="map-selected-close" onClick={()=>setSelectedMapStore(null)} aria-label="Fechar detalhes"><X size={15}/></button>
            </div>}

            <div className="map-sheet-list">
              {mapStores.map(store=>{
                const brand=getStoreBrand(store);
                const distanceLabel=store.distance===null?"Coordenada pendente":(userLocation?.precision==="approximate"?"≈ ":"")+(store.distance<1?Math.round(store.distance*1000)+" m":store.distance.toFixed(1)+" km");
                const metric=typeof store.mapPrice==="number"?(store.mapPriceType==="estimated"?"≈ ":"")+formatMapPrice(store.mapPrice):searchPerformed?"Sem preço confirmado":distanceLabel;
                return <button type="button" className={"map-store-row"+(selectedMapStore?.id===store.id?" is-selected":"")} key={store.id} onClick={()=>{
                  setSelectedMapStore(store);
                  if(store.latitude!==null&&store.longitude!==null)leafletMapRef.current?.setView([store.latitude,store.longitude],16);
                }}>
                  <span className="store-brand-mini" style={{"--brand-accent":brand.color} as CSSProperties}><b>{brand.initials}</b>{store.brand_logo_url&&<img src={store.brand_logo_url} alt="" onError={event=>event.currentTarget.remove()}/>}</span>
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
          </section>

          {searchPerformed&&<div className="price-results map-price-results">
            <div className="nearby-head"><div><p className="eyebrow">COMPARAÇÃO DE PREÇOS</p><h2>{priceResults.length} ofertas válidas</h2></div></div>
            {priceResults.map(r=><div className="price-result-row" key={r.id}><div className="place-info"><b>{r.store.name}</b><small>{r.product.name}{r.product.variant?" · "+r.product.variant:""} · {r.price_type === "estimated" ? "estimativa baseada na fonte" : r.price_type === "official_site" ? "preço do site" : "preço informado em loja"} · {r.source_label}</small><small>Atualizado em {new Date(r.observed_at).toLocaleString("pt-BR")} · {r.availability_status === "available" ? "disponibilidade indicada pela fonte" : "estoque não confirmado"}</small></div><strong>R$ {Number(r.price).toFixed(2).replace(".",",")}</strong>{r.source_url&&<a href={r.source_url} target="_blank" rel="noreferrer">Fonte</a>}</div>)}
            {priceResults.length===0&&<p className="empty-state">Nenhum preço verificado disponível. Não exibiremos valores sem fonte confiável.</p>}
          </div>}
          <p className="demo-note map-demo-note">Preços só aparecem quando existe uma fonte verificável. Ainda não há integração automática com todos os sites de farmácias.</p>
        </section>}
        {tab === "ai" && <section className="screen ai-screen">
          <div className="ai-heading"><div className="ai-orb"><img src="/zorvi-mark.webp" alt="Símbolo ZORVI" /></div><p className="eyebrow">SUA COMPANHEIRA DE DESCOBERTAS</p><h1>Olá! Eu sou a<br/><span>ZORVI AI.</span></h1><p>Uma nova forma de encontrar, comparar e descobrir o mundo ao seu redor.</p></div>
          <div className="chat-panel"><div className="chat-top"><div className="ai-mini"><Sparkles size={16}/></div><div><b>ZORVI AI</b><small><i className="online-dot"/> Assistente demonstrativo</small></div><button className="icon-button" onClick={() => setChat([{role:"assistant",text:"Conversa reiniciada! O que você quer descobrir hoje?"}])}>•••</button></div>
          <div className="chat-messages">{chat.map((m,i) => <div className={"chat-message " + m.role} key={i}>{m.role === "assistant" && <span className="chat-avatar"><Sparkles size={13}/></span>}<p>{m.text}</p></div>)}</div>
          <div className="suggestion-label">EXPERIMENTE PERGUNTAR</div><div className="suggestions"><button onClick={() => send("Onde encontro um produto mais barato?")}><Wallet size={14}/> Onde encontro mais barato?</button><button onClick={() => send("Quais lugares legais existem perto de mim?")}><Compass size={14}/> Lugares legais por perto</button><button onClick={() => send("Quero descobrir promoções de hoje.")}><Zap size={14}/> Promoções de hoje</button></div>
          <form className="chat-input" onSubmit={(e) => {e.preventDefault();send(message);}}><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Pergunte qualquer coisa..."/><button type="submit"><Send size={18}/></button></form></div>
          <p className="demo-note">A IA ainda não está conectada a um modelo ou dados ao vivo. Respostas demonstrativas.</p>
        </section>}
        {tab === "search" && <section className="screen"><div className="screen-title"><div><p className="eyebrow">ENCONTRE SUA PRÓXIMA DESCOBERTA</p><h1>Explorar</h1><p>Produtos, lugares, preços e experiências.</p></div></div><div className="search-large"><Search size={20}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="O que você está procurando?"/><button onClick={() => setQuery("")}><X size={16}/></button></div><p className="eyebrow category-label">CATEGORIAS POPULARES</p><div className="category-grid">{[{name:"Mercados",icon:ShoppingBag},{name:"Restaurantes",icon:Utensils},{name:"Farmácias",icon:Plus},{name:"Experiências",icon:Sparkles}].map((c) => {const Icon=c.icon;return <button className="category-card" key={c.name} onClick={() => {setFilter(c.name==="Mercados"?"Mercado":c.name==="Restaurantes"?"Restaurante":c.name==="Farmácias"?"Farmácia":"Todos");setTab("map");}}><span className="place-icon"><Icon size={21}/></span><b>{c.name}</b><ArrowRight size={15}/></button>;})}</div><div className="section-heading search-trends"><div><p className="eyebrow">EM ALTA NA COMUNIDADE</p><h2>Descobertas populares</h2></div></div>{["Cafés para conhecer","Economize nas compras","Descubra com a ZORVI AI"].map((t,i) => <button className="trend-row" key={t} onClick={() => setTab(i===2?"ai":"map")}><span className="trend-icon">{i===2?<Sparkles size={18}/>:<ShoppingBag size={18}/>}</span><span><b>{t}</b><small>Ideias para sua próxima descoberta</small></span><ArrowRight size={17}/></button>)}<p className="demo-note">Resultados e tendências são exemplos para demonstração.</p></section>}
        {tab === "profile" && <section className="screen"><div className="profile-top"><p className="eyebrow">SEU ESPAÇO ZORVI</p><button className="icon-button" onClick={() => notify("Configurações em breve")}><Settings2 size={20}/></button></div><div className="profile-hero"><div className="profile-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt={"Foto de " + accountName}/> : accountInitial}<span className="profile-online"/></div><h1>{accountName}</h1><p>@{profile?.username || "explorador"} · {session?.user.email || "Explorador ZORVI"}</p>{profile?.bio && <p className="profile-bio">{profile.bio}</p>}<button className="edit-profile" onClick={openProfileEditor}>Editar perfil</button></div><div className="stats-row"><div><b>12</b><small>Publicações</small></div><div><b>248</b><small>Seguidores</small></div><div><b>186</b><small>Seguindo</small></div></div><div className="profile-menu"><button onClick={() => notify(saved.length + " itens salvos nesta sessão")}><Bookmark size={19}/><span><b>Itens salvos</b><small>Suas descobertas favoritas</small></span><ArrowRight size={17}/></button><button onClick={() => notify("Suas avaliações aparecerão aqui")}><Heart size={19}/><span><b>Avaliações</b><small>Compartilhe suas experiências</small></span><ArrowRight size={17}/></button><button onClick={() => setDark(!dark)}>{dark?<Sun size={19}/>:<Moon size={19}/>}<span><b>Aparência</b><small>{dark?"Tema escuro ativado":"Tema claro ativado"}</small></span><span className={"toggle-pill " + (dark?"on":"")}/></button><button onClick={() => notify("Preferências em breve")}><Settings2 size={19}/><span><b>Configurações</b><small>Privacidade e preferências</small></span><ArrowRight size={17}/></button>{session && <button onClick={signOut}><UserRound size={19}/><span><b>Sair da conta</b><small>Encerrar sua sessão com segurança</small></span><ArrowRight size={17}/></button>}</div><div className="profile-invite"><Sparkles size={19}/><div><b>Convide sua comunidade</b><small>Descobertas ficam melhores quando compartilhadas.</small></div><button onClick={() => notify("Convite copiado (demonstração)")}><Share2 size={17}/></button></div><p className="demo-note">{session ? "Conta conectada com Supabase." : "Modo demonstração. Configure o Supabase para ativar contas reais."}</p></section>}
      </main>
      <nav className="bottom-nav" aria-label="Navegação principal">{[{id:"home" as Tab,label:"Início",icon:Home},{id:"map" as Tab,label:"Mapa",icon:MapPin},{id:"ai" as Tab,label:"ZORVI AI",icon:Sparkles},{id:"search" as Tab,label:"Explorar",icon:Compass},{id:"profile" as Tab,label:"Perfil",icon:UserRound}].map((item) => {const Icon=item.icon;return <button key={item.id} className={"nav-item "+(tab===item.id?"active":"")+(item.id==="ai"?" nav-ai":"")} onClick={() => setTab(item.id)}><span><Icon size={item.id==="ai"?21:20}/></span><small>{item.label}</small></button>;})}</nav>
    </div>
    {editProfileOpen && <div className="modal-backdrop" onClick={() => !profileSaving && setEditProfileOpen(false)}><div className="composer-modal profile-edit-modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-head"><h2>Editar perfil</h2><button className="icon-button" onClick={() => setEditProfileOpen(false)} disabled={profileSaving}><X size={19}/></button></div>
      <div className="avatar-edit-wrap"><div className="profile-avatar edit-avatar-preview">{avatarPreview ? <img src={avatarPreview} alt="Prévia da foto"/> : accountInitial}</div><label className="avatar-upload-button"><Camera size={15}/> Alterar foto<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => chooseAvatar(e.target.files?.[0])}/></label><small>JPG, PNG ou WebP · máximo 5 MB</small></div>
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
    {showSplash && <div className="zorvi-splash" aria-label="ZORVI"><img src="/zorvi-mark.webp" alt="" /><div className="splash-word">ZORVI</div><p>Tudo se conecta. Tudo se descobre.</p><span className="splash-loader" /></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "ZORVI — Tudo se conecta. Tudo se descobre." }, { name: "description", content: "Descubra lugares, pessoas, produtos e experiências com a ZORVI." }, { name: "theme-color", content: "#080610" }] }),
  component: App,
});
