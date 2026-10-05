# ClosetCue 👗
*Your wardrobe. Picked for you.* Built for my sister for the Hacktoberfest 2026 "Build for a Friend" challenge.

Photograph the clothes you own, set your style, and get an outfit each morning from your real wardrobe, never repeating a complete outfit.

**How it works:** a local open-weight model (Gemma via Ollama) reads clothing photos and suggests outfits. Plain code handles storage, history, repeat-prevention and ranking. Photos stay on your computer.

## Run it
```bash
# 1. AI (one time)
ollama pull gemma4:e4b

# 2. Backend
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && uvicorn main:app --reload

# 3. Frontend (new terminal)
cd frontend && npm install && npm run dev -- --host
```
Open the URL Vite prints. If Ollama is off, ClosetCue still works in simple mode.
