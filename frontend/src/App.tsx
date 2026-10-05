import { useCallback, useEffect, useState } from 'react'

type Item = { id: number; image: string; category: string; type: string; colour: string; pattern: string; style: string; season: string; reviewed: number }
type Outfit = { item_ids: number[]; why: string; source: string }
type Entry = { id: number; day: string; occasion: string; items: Item[] }
type Hist = { today: string; entries: Entry[] }
type Profile = { styles: string[]; vibes: string[] }
type Tab = 'today' | 'wardrobe' | 'add' | 'style' | 'history'

const CATS = ['Top', 'Bottom', 'Dress', 'Shoes', 'Outerwear', 'Accessory']
const STYLES = ['Casual', 'Feminine', 'Trendy', 'Minimal', 'Streetwear', 'Sporty', 'Vintage', 'Preppy']
const VIBES = ['Cute', 'Comfortable', 'Simple', 'Put-together', 'Trendy', 'Effortless']
const PATTERNS = ['Solid', 'Striped', 'Floral', 'Plaid', 'Graphic', 'Other']
const SEASONS = ['Spring/Summer', 'Fall/Winter', 'All year']
const REASONS = ["I don't like the colours", "I don't like the outfit", "It doesn't feel like my style", 'It looks uncomfortable', 'Just show me another']

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const r = await fetch('/api' + path, init)
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Something went wrong')
  return r.json()
}
const send = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const img = (i: Item) => `/uploads/${i.image}`
const primary = 'rounded-full bg-rose px-6 py-3 font-semibold text-white shadow-md shadow-rose/30 active:scale-95 transition disabled:opacity-50'
const ghost = 'rounded-full border-2 border-sand bg-white/60 px-6 py-3 font-semibold text-ink active:scale-95 transition'

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 ${on ? 'bg-rose text-white shadow' : 'bg-white text-ink border border-sand'}`}>
      {children}
    </button>
  )
}

function Collage({ pieces }: { pieces: Item[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 rise">
      {pieces.map((p, i) => (
        <div key={p.id} className={`relative overflow-hidden rounded-3xl bg-white shadow-lg shadow-ink/10 ${pieces.length % 2 && i === pieces.length - 1 ? 'col-span-2 aspect-[16/10]' : 'aspect-[3/4]'}`}>
          <img src={img(p)} className="h-full w-full object-cover" />
          <span className="absolute bottom-2 left-2 rounded-full bg-cream/90 px-3 py-1 text-xs font-semibold">{p.category}</span>
        </div>
      ))}
    </div>
  )
}

function Today({ items, hist, anchor, setAnchor, reload, aiOn }: { items: Item[]; hist: Hist; anchor: Item | null; setAnchor: (i: Item | null) => void; reload: () => Promise<void>; aiOn: boolean }) {
  const [occasion, setOccasion] = useState('School')
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [idx, setIdx] = useState(0)
  const [seen, setSeen] = useState<number[][]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [regen, setRegen] = useState(false)
  const [asking, setAsking] = useState(false)
  const todays = hist.entries.find(e => e.day === hist.today)
  const showWorn = !!todays && !regen && !anchor
  const byId = new Map(items.map(i => [i.id, i]))
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const generate = useCallback(async (exclude: number[][]) => {
    setLoading(true); setErr('')
    try {
      const r = await api<{ outfits: Outfit[] }>('/outfits', send('POST', { occasion, anchor_id: anchor?.id ?? null, exclude }))
      setOutfits(r.outfits); setIdx(0)
      if (!r.outfits.length) setErr('I need a few more pieces first: add at least a top, a bottom and shoes (or a dress).')
    } catch (e) { setErr((e as Error).message) }
    setLoading(false)
  }, [occasion, anchor])

  useEffect(() => { if (!showWorn && items.length) { setSeen([]); generate([]) } }, [showWorn, items.length, generate])

  const current = outfits[idx]
  const pieces = current ? (current.item_ids.map(i => byId.get(i)).filter(Boolean) as Item[]) : []

  const wear = async () => {
    await api('/history', send('POST', { occasion, item_ids: current.item_ids, worn: true }))
    setAnchor(null); setRegen(false); await reload()
  }
  const next = (reason: string) => {
    setAsking(false)
    const ids = [...current.item_ids].sort((a, b) => a - b)
    api('/history', send('POST', { occasion, item_ids: ids, worn: false, reason: reason === REASONS[4] ? '' : reason })).catch(() => {})
    const s = [...seen, ids]; setSeen(s)
    if (idx + 1 < outfits.length) setIdx(idx + 1); else generate(s)
  }

  return (
    <div className="space-y-5">
      <header className="rise">
        <p className="text-sm font-medium text-berry">{hello} ☀️</p>
        <h1 className="font-display text-4xl leading-tight">{showWorn ? "Today's outfit" : anchor ? 'Built around your piece' : 'What to wear today'}</h1>
      </header>
      {!aiOn && <p className="rounded-2xl bg-blush px-4 py-3 text-sm">The AI stylist is resting, so I'm using simple mode. Start Ollama for smarter picks.</p>}
      {!showWorn && (
        <div className="flex flex-wrap gap-2">
          {['School', 'Going out'].map(o => <Chip key={o} on={occasion === o} onClick={() => setOccasion(o)}>{o === 'School' ? '🎒 School' : '🛍️ Shopping / going out'}</Chip>)}
          {anchor && <Chip on onClick={() => setAnchor(null)}>✕ {anchor.colour} {anchor.type}</Chip>}
        </div>
      )}
      {!items.length && <p className="rounded-3xl bg-white p-6 text-center">Your wardrobe is empty. Add some photos first and I'll start picking!</p>}
      {showWorn && todays && (
        <>
          <Collage pieces={todays.items} />
          <p className="text-center font-display text-lg">You're all set. Have a great day ♡</p>
          <button className={ghost + ' w-full'} onClick={() => setRegen(true)}>Pick something different</button>
        </>
      )}
      {!showWorn && loading && <div className="grid grid-cols-2 gap-3">{[0, 1, 2].map(i => <div key={i} className="aspect-[3/4] animate-pulse rounded-3xl bg-sand" />)}</div>}
      {!showWorn && !loading && err && <p className="rounded-3xl bg-white p-6 text-center">{err}</p>}
      {!showWorn && !loading && current && (
        <>
          <Collage pieces={pieces} />
          <div className="rise rounded-3xl bg-blush p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-berry">Why this works</p>
            <p className="mt-1">{current.why || 'It matches your style and uses pieces you have not worn lately.'}</p>
          </div>
          <div className="flex gap-3">
            <button className={primary + ' flex-1'} onClick={wear}>❤️ Wear this</button>
            <button className={ghost + ' flex-1'} onClick={() => setAsking(true)}>🔄 Try another</button>
          </div>
        </>
      )}
      {asking && (
        <Sheet close={() => setAsking(false)}>
          <h2 className="mb-3 font-display text-2xl">What's not right?</h2>
          <div className="space-y-2">{REASONS.map(r => <button key={r} onClick={() => next(r)} className="w-full rounded-2xl bg-white px-4 py-3 text-left font-medium active:bg-blush">{r}</button>)}</div>
        </Sheet>
      )}
    </div>
  )
}

function Sheet({ close, children }: { close: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-ink/40" onClick={close}>
      <div className="rise mx-auto max-h-[90vh] w-full max-w-md overflow-auto rounded-t-3xl bg-cream p-5 pb-8" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold">{label}<div className="mt-1 font-normal">{children}</div></label>
}
const input = 'w-full rounded-xl border border-sand bg-white px-3 py-2'

function EditSheet({ item, close, saved, build }: { item: Item; close: () => void; saved: () => void; build: (i: Item) => void }) {
  const [f, setF] = useState(item)
  const set = (k: keyof Item, v: string) => setF({ ...f, [k]: v })
  const pick = (k: keyof Item, opts: string[]) => <select className={input} value={f[k] as string} onChange={e => set(k, e.target.value)}>{opts.map(o => <option key={o}>{o}</option>)}</select>
  const save = async () => { await api(`/items/${item.id}`, send('PATCH', f)); saved(); close() }
  const del = async () => { if (confirm('Remove this piece from your wardrobe?')) { await api(`/items/${item.id}`, { method: 'DELETE' }); saved(); close() } }
  return (
    <Sheet close={close}>
      <img src={img(item)} className="mx-auto mb-4 max-h-64 rounded-2xl object-contain" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">{pick('category', CATS)}</Field>
        <Field label="Type"><input className={input} value={f.type} onChange={e => set('type', e.target.value)} /></Field>
        <Field label="Colour"><input className={input} value={f.colour} onChange={e => set('colour', e.target.value)} /></Field>
        <Field label="Pattern">{pick('pattern', PATTERNS)}</Field>
        <Field label="Style">{pick('style', STYLES)}</Field>
        <Field label="Season">{pick('season', SEASONS)}</Field>
      </div>
      <div className="mt-5 space-y-2">
        <button className={primary + ' w-full'} onClick={save}>Save</button>
        <button className={ghost + ' w-full'} onClick={() => { build(item); close() }}>✨ Build an outfit around this</button>
        <button className="w-full py-2 text-sm text-berry" onClick={del}>Remove piece</button>
      </div>
    </Sheet>
  )
}

function Wardrobe({ items, reload, build, go }: { items: Item[]; reload: () => void; build: (i: Item) => void; go: (t: Tab) => void }) {
  const [cat, setCat] = useState('All')
  const [open, setOpen] = useState<Item | null>(null)
  const shown = items.filter(i => cat === 'All' || i.category === cat)
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl rise">My wardrobe</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">{['All', ...CATS].map(c => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}</div>
      {!items.length ? (
        <div className="rounded-3xl bg-white p-8 text-center"><p className="font-display text-xl">Your closet is waiting 👗</p><button className={primary + ' mt-4'} onClick={() => go('add')}>Add your first pieces</button></div>
      ) : (
        <div className="columns-2 gap-3">
          {shown.map(i => (
            <button key={i.id} onClick={() => setOpen(i)} className="rise relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-2xl bg-white text-left shadow-md shadow-ink/10">
              <img src={img(i)} className="w-full" loading="lazy" />
              {!i.reviewed && <span className="absolute right-2 top-2 h-3 w-3 rounded-full bg-rose ring-2 ring-white" />}
              <p className="px-3 py-2 text-sm font-medium">{i.colour} {i.type || i.category}</p>
            </button>
          ))}
        </div>
      )}
      {items.some(i => !i.reviewed) && <p className="text-center text-sm text-berry">Tap pieces with a pink dot to check what the AI saw.</p>}
      {open && <EditSheet item={open} close={() => setOpen(null)} saved={reload} build={build} />}
    </div>
  )
}

function Add({ done }: { done: (ok: number, bad: string[]) => void }) {
  const [busy, setBusy] = useState('')
  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files); const bad: string[] = []; let ok = 0
    for (let i = 0; i < list.length; i++) {
      setBusy(`Looking at piece ${i + 1} of ${list.length}…`)
      const fd = new FormData(); fd.append('file', list[i])
      try { await api('/items', { method: 'POST', body: fd }); ok++ } catch (e) { bad.push((e as Error).message) }
    }
    setBusy(''); done(ok, bad)
  }
  return (
    <div className="space-y-5">
      <h1 className="font-display text-4xl rise">Add clothes</h1>
      <p>Photograph one piece at a time on a plain background, or pick lots of photos at once. The AI will describe each piece and you can fix anything it gets wrong.</p>
      <label className={`flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-rose bg-blush text-center ${busy ? 'animate-pulse' : ''}`}>
        <span className="text-5xl">📸</span>
        <span className="font-display text-xl">{busy || 'Tap to add photos'}</span>
        <input type="file" accept="image/*" multiple className="hidden" disabled={!!busy} onChange={e => pick(e.target.files)} />
      </label>
    </div>
  )
}

function StyleScreen({ profile, save }: { profile: Profile; save: (p: Profile) => void }) {
  const toggle = (k: keyof Profile, v: string) => save({ ...profile, [k]: profile[k].includes(v) ? profile[k].filter(x => x !== v) : [...profile[k], v] })
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl rise">My style</h1>
      <p>Pick as many as you like. This is your style, so you're the one who decides.</p>
      <section><h2 className="mb-2 font-display text-xl">Styles I love</h2><div className="flex flex-wrap gap-2">{STYLES.map(s => <Chip key={s} on={profile.styles.includes(s)} onClick={() => toggle('styles', s)}>{s}</Chip>)}</div></section>
      <section><h2 className="mb-2 font-display text-xl">The vibe I want</h2><div className="flex flex-wrap gap-2">{VIBES.map(s => <Chip key={s} on={profile.vibes.includes(s)} onClick={() => toggle('vibes', s)}>{s}</Chip>)}</div></section>
    </div>
  )
}

function History({ hist }: { hist: Hist }) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl rise">Outfit history</h1>
      {!hist.entries.length && <p className="rounded-3xl bg-white p-6 text-center">Nothing here yet. Tap "Wear this" on an outfit and it will show up here.</p>}
      {hist.entries.map(e => (
        <div key={e.id} className="rise rounded-3xl bg-white p-4 shadow-md shadow-ink/10">
          <p className="mb-2 text-sm font-semibold">{new Date(e.day + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} <span className="font-normal text-berry">· {e.occasion}</span></p>
          <div className="flex gap-2">{e.items.map(i => <img key={i.id} src={img(i)} className="h-24 w-20 rounded-xl object-cover" />)}</div>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [items, setItems] = useState<Item[]>([])
  const [hist, setHist] = useState<Hist>({ today: '', entries: [] })
  const [profile, setProfile] = useState<Profile>({ styles: [], vibes: [] })
  const [aiOn, setAiOn] = useState(true)
  const [anchor, setAnchor] = useState<Item | null>(null)
  const [note, setNote] = useState('')
  const [ready, setReady] = useState(false)

  const loadItems = useCallback(async () => setItems(await api<Item[]>('/items')), [])
  const loadHist = useCallback(async () => setHist(await api<Hist>('/history')), [])
  useEffect(() => {
    Promise.all([loadItems(), loadHist(), api<Profile>('/profile').then(setProfile), api<{ ai: boolean }>('/health').then(h => setAiOn(h.ai))])
      .catch(() => setNote("Can't reach the ClosetCue server. Is the backend running?")).finally(() => setReady(true))
  }, [loadItems, loadHist])
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(''), 5000); return () => clearTimeout(t) } }, [note])

  const build = (i: Item) => { setAnchor(i); setTab('today') }
  const saveProfile = (p: Profile) => { setProfile(p); api('/profile', send('PUT', p)).catch(() => {}) }
  const tabs: [Tab, string, string][] = [['today', '☀️', 'Today'], ['wardrobe', '👗', 'Closet'], ['add', '＋', 'Add'], ['style', '🌸', 'Style'], ['history', '🗓️', 'History']]

  return (
    <div className="mx-auto min-h-screen max-w-md px-5 pb-32 pt-8">
      {note && <div className="fixed left-1/2 top-4 z-40 -translate-x-1/2 rounded-full bg-ink px-5 py-2 text-sm text-white shadow-lg">{note}</div>}
      {!ready ? <p className="pt-24 text-center font-display text-2xl">ClosetCue…</p> : <>
        {tab === 'today' && <Today items={items} hist={hist} anchor={anchor} setAnchor={setAnchor} reload={loadHist} aiOn={aiOn} />}
        {tab === 'wardrobe' && <Wardrobe items={items} reload={() => { loadItems(); loadHist() }} build={build} go={setTab} />}
        {tab === 'add' && <Add done={async (ok, bad) => { await loadItems(); setNote(bad.length ? bad[0] : `${ok} piece${ok === 1 ? '' : 's'} added ✨`); if (ok) setTab('wardrobe') }} />}
        {tab === 'style' && <StyleScreen profile={profile} save={saveProfile} />}
        {tab === 'history' && <History hist={hist} />}
      </>}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-sand bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-md justify-around px-2 py-2">
          {tabs.map(([t, icon, label]) => (
            <button key={t} onClick={() => setTab(t)} className={`flex w-16 flex-col items-center rounded-2xl py-1 text-xs font-medium transition ${tab === t ? 'text-berry' : 'text-ink/50'}`}>
              <span className={`text-xl ${t === 'add' ? 'flex h-9 w-9 items-center justify-center rounded-full bg-rose text-white' : ''}`}>{icon}</span>{label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
