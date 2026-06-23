# Autopilot — Portfolio Planning

Local-first project planning tool with PERT network, Gantt chart, critical path computation, and versioned backups. No backend required.

## Deploy to GitHub Pages

### One-time setup (do this once)

1. **Enable GitHub Pages in your repo**
   - Go to your repository on GitHub: `https://github.com/ShankarKaruppusamyAmplicomm/Autopilot`
   - Click **Settings** → **Pages** (left sidebar)
   - Under **Source**, select **GitHub Actions**
   - Click **Save**

2. **Push the code** (if not already done)
   ```bash
   git add .
   git commit -m "Add GitHub Pages deployment"
   git push origin main
   ```

3. **Watch the deployment**
   - Go to the **Actions** tab in your GitHub repo
   - You will see a workflow called **Deploy to GitHub Pages** running
   - Once it turns green (≈ 2 minutes), your app is live

4. **Open the live app**
   ```
   https://shankarkaruppusamyamplicomm.github.io/Autopilot/
   ```

### Every future update

Just push to `main` — GitHub Actions automatically rebuilds and redeploys:

```bash
git add .
git commit -m "Your change description"
git push origin main
```

The workflow takes about 2 minutes to complete after each push.

---

## Local development

```bash
cd autopilot-app
npm install
npm run dev        # starts dev server at http://localhost:5174
npm run build      # production build into autopilot-app/dist/
npm run preview    # preview the production build locally
```

## Versioned backups

In **Settings → Backup History**, click **+ Save Version** to snapshot the full portfolio. Each version records:
- Auto-incrementing label (V1, V2, V3…)
- Who made the change (your name)
- What changed (description)
- Date and time

Versions are stored in IndexedDB in your browser. Use **↓ Download** on any version to save it as a JSON file.

## Architecture

| Layer | Technology |
|---|---|
| UI | React 19 + TypeScript + CSS Modules |
| State | Zustand |
| Persistence | Dexie (IndexedDB) |
| Scheduling | Custom PERT engine (forward/backward pass, Kahn's topo sort) |
| DAG layout | dagre |
| Export | PptxGenJS, jsPDF, docx |
| PWA | vite-plugin-pwa + Workbox |
| Deployment | GitHub Actions → GitHub Pages |
