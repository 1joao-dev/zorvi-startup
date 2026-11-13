import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { AuthScreen } from "@/components/AuthScreen";
import { ArrowRight, Bell, Bookmark, Camera, Check, Compass, Heart, Home, MapPin, MessageCircle, Moon, Plus, Search, Send, Settings2, Share2, ShoppingBag, Sparkles, Sun, UserRound, Utensils, Wallet, X, Zap } from "lucide-react";

type Tab = "home" | "map" | "ai" | "search" | "profile";
type UserProfile = { id: string; username: string | null; display_name: string; avatar_url: string | null; bio: string | null };
const demoPlaces = [
  { name: "Mercado Pão de Açúcar", type: "Mercado", distance: "450 m", icon: ShoppingBag },
  { name: "Farmácia do Povo", type: "Farmácia", distance: "650 m", icon: Plus },
  { name: "Café Botânico", type: "Restaurante", distance: "800 m", icon: Utensils },
  { name: "Shopping Riverside", type: "Lojas", distance: "1,2 km", icon: Wallet },
];
const seedPosts = [
  { id: 1, name: "Marina Costa", handle: "@marinacosta", time: "há 12 min", text: "Achei um cantinho incrível para tomar café e trabalhar. O ambiente é lindo e o cappuccino é perfeito ☕", place: "Café Botânico · Teresina", image: "https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=900&auto=format&fit=crop", likes: 128, comments: 18 },
  { id: 2, name: "Pedro Lima", handle: "@pedrolima", time: "há 38 min", text: "Dica para quem está economizando: compare os preços antes de sair. Pequenas diferenças fazem muita diferença no fim do mês.", place: "Centro · Teresina", image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&auto=format&fit=crop", likes: 86, comments: 9 },
];

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
  const [liked, setLiked] = useState<number[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  const [posts, setPosts] = useState(seedPosts);
  const [composer, setComposer] = useState(false);
  const [postText, setPostText] = useState("");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([{ role: "assistant", text: "Oi! ✨ Sou a ZORVI AI. Posso ajudar você a descobrir lugares, comparar opções e encontrar experiências. O que vamos explorar hoje?" }]);
  const [toast, setToast] = useState("");
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(""), 2300); };
  const send = (value: string) => {
    if (!value.trim()) return;
    setChat((old) => [...old, { role: "user", text: value }, { role: "assistant", text: "Boa pergunta! Esta é uma prévia da ZORVI AI. Quando conectarmos os dados reais e a inteligência artificial, vou poder comparar opções perto de você. Por enquanto, explore os locais demonstrativos no mapa." }]);
    setMessage("");
  };
  const publish = () => {
    if (!postText.trim()) return;
    setPosts((old) => [{ id: Date.now(), name: "Você", handle: "@voce", time: "agora", text: postText, place: "Sua localização", image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=900&auto=format&fit=crop", likes: 0, comments: 0 }, ...old]);
    setPostText(""); setComposer(false); setTab("home"); notify("Publicação adicionada ao seu feed!");
  };
  const filtered = demoPlaces.filter((p) => (filter === "Todos" || p.type === filter) && (p.name.toLowerCase().includes(query.toLowerCase()) || p.type.toLowerCase().includes(query.toLowerCase())));

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
          <div className="welcome-row"><div><p className="eyebrow">SUA CIDADE, NOVAS POSSIBILIDADES</p><h1>Descubra o que<br/><span>move você.</span></h1></div><button className="location-pill" onClick={() => notify("Localização demonstrativa: Teresina, PI")}><MapPin size={14}/> Teresina, PI</button></div>
          <button className="search-hero" onClick={() => setTab("search")}><Search size={18}/><span>O que você quer descobrir hoje?</span><Compass size={17}/></button>
          <div className="section-heading"><div><p className="eyebrow">PERTO DE VOCÊ</p><h2>Explore possibilidades</h2></div><button className="text-link" onClick={() => setTab("map")}>Ver mapa <ArrowRight size={15}/></button></div>
          <div className="discovery-cards"><button className="discovery-card discovery-purple" onClick={() => setTab("map")}><span className="discovery-icon"><MapPin size={19}/></span><b>Mapa inteligente</b><small>Lugares ao seu redor</small><ArrowRight className="discovery-arrow" size={17}/></button><button className="discovery-card discovery-pink" onClick={() => setTab("ai")}><span className="discovery-icon"><Sparkles size={19}/></span><b>ZORVI AI</b><small>Descubra com inteligência</small><ArrowRight className="discovery-arrow" size={17}/></button></div>
          <div className="section-heading feed-heading"><div><p className="eyebrow">COMUNIDADE ZORVI</p><h2>O que está acontecendo</h2></div><button className="round-add" onClick={() => setComposer(true)}><Plus size={19}/></button></div>
          <div className="stories">{["Seu momento","Marina","Pedro","Camila","Lucas"].map((n,i) => <button className="story" key={n} onClick={() => i === 0 ? setComposer(true) : notify("Stories em breve")}><span className={"story-ring story-" + i}>{i === 0 ? <Plus size={20}/> : n[0]}</span><small>{n}</small></button>)}</div>
          {posts.map((p) => <article className="post-card" key={p.id}><div className="post-header"><div className="avatar">{p.name[0]}</div><div className="post-author"><b>{p.name}</b><small>{p.handle} · {p.time}</small></div><button className="icon-button" onClick={() => notify("Mais opções em breve")}>•••</button></div><p className="post-copy">{p.text}</p><div className="post-image-wrap"><img src={p.image} alt="Imagem da publicação"/><span className="post-tag">DESCOBERTA</span></div><div className="post-place"><MapPin size={14}/> {p.place}</div><div className="post-actions"><button className={liked.includes(p.id) ? "action-active" : ""} onClick={() => setLiked((v) => v.includes(p.id) ? v.filter((x) => x !== p.id) : [...v,p.id])}><Heart size={19} fill={liked.includes(p.id) ? "currentColor" : "none"}/> {p.likes + (liked.includes(p.id) ? 1 : 0)}</button><button onClick={() => notify("Comentários em breve")}><MessageCircle size={19}/> {p.comments}</button><button onClick={() => notify("Link copiado (demonstração)")}><Share2 size={18}/></button><button className="save-action" onClick={() => setSaved((v) => v.includes(p.id) ? v.filter((x) => x !== p.id) : [...v,p.id])}><Bookmark size={19} fill={saved.includes(p.id) ? "currentColor" : "none"}/></button></div></article>)}
          <p className="demo-note">Conteúdo demonstrativo · ofertas e locais reais serão conectados futuramente.</p>
        </section>}
        {tab === "map" && <section className="screen">
          <div className="screen-title"><div><p className="eyebrow">DESCUBRA AO REDOR</p><h1>Mapa inteligente</h1><p>Encontre o que importa, perto de você.</p></div></div>
          <div className="map-search"><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar lugares ou categorias"/><button onClick={() => setQuery("")}><X size={16}/></button></div>
          <div className="filter-row">{["Todos","Mercado","Farmácia","Restaurante","Lojas"].map((f) => <button key={f} className={filter === f ? "filter-chip selected" : "filter-chip"} onClick={() => setFilter(f)}>{f}</button>)}</div>
          <div className="map-visual"><div className="map-grid-lines"/><div className="map-river"/><span className="map-label label-one">CENTRO</span><span className="map-label label-two">JÓQUEI</span><span className="map-label label-three">FÁTIMA</span><span className="map-road road-one"/><span className="map-road road-two"/><span className="map-road road-three"/><div className="map-pin pin-one"><ShoppingBag size={15}/></div><div className="map-pin pin-two"><Utensils size={15}/></div><div className="map-pin pin-three"><Plus size={15}/></div><div className="map-pin pin-four"><Wallet size={15}/></div><div className="you-pin"><span/></div><div className="map-current">Você está aqui</div><button className="map-locate" onClick={() => notify("Localização demonstrativa ativada")}><MapPin size={18}/></button><div className="map-caption">MAPA ILUSTRATIVO · TERESINA, PI</div></div>
          <div className="nearby-head"><div><p className="eyebrow">SELEÇÃO ZORVI</p><h2>{filtered.length} lugares por perto</h2></div></div>
          <div className="place-list">{filtered.map((p) => { const Icon = p.icon; return <button className="place-row" key={p.name} onClick={() => notify(p.name + " · local demonstrativo")}><span className="place-icon"><Icon size={19}/></span><span className="place-info"><b>{p.name}</b><small>{p.type} · Local demonstrativo</small></span><span className="place-distance">{p.distance}</span><ArrowRight size={16}/></button>; })}{filtered.length === 0 && <p className="empty-state">Nenhum lugar encontrado.</p>}</div>
          <p className="demo-note">Pontos e distâncias ilustrativos. Mapbox e localização real serão integrados em uma próxima etapa.</p>
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
    {composer && <div className="modal-backdrop" onClick={() => setComposer(false)}><div className="composer-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h2>Nova publicação</h2><button className="icon-button" onClick={() => setComposer(false)}><X size={19}/></button></div><textarea value={postText} onChange={(e) => setPostText(e.target.value)} placeholder="Compartilhe uma descoberta com a comunidade..."/><div className="composer-footer"><span><MapPin size={14}/> Adicionar localização</span><button className="primary-button" disabled={!postText.trim()} onClick={publish}>Publicar <ArrowRight size={16}/></button></div></div></div>}
    {showSplash && <div className="zorvi-splash" aria-label="ZORVI"><img src="/zorvi-mark.webp" alt="" /><div className="splash-word">ZORVI</div><p>Tudo se conecta. Tudo se descobre.</p><span className="splash-loader" /></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "ZORVI — Tudo se conecta. Tudo se descobre." }, { name: "description", content: "Descubra lugares, pessoas, produtos e experiências com a ZORVI." }, { name: "theme-color", content: "#080610" }] }),
  component: App,
});
