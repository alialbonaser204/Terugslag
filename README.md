# Terugslag – Gun Duel

Een 3D-schietspel waarin je beweegt met de terugslag van je pistool. Je kunt alleen spelen (10 levels) of online 1 tegen 1 tegen een vriend.

## Lokaal starten

```bash
npm install
npm start
```

Open daarna http://localhost:3000

## Online zetten op Railway

1. Zet deze map in een GitHub-repository. De map `node_modules` hoort er niet bij.
2. Ga naar https://railway.com, log in met GitHub en kies **New Project → Deploy from GitHub repo**. Kies daar je repository.
3. Railway ziet zelf dat het een Node-project is en start het met `npm start`. De server gebruikt automatisch de `PORT` die Railway opgeeft.
4. Ga naar **Settings → Networking → Generate Domain**. Je krijgt dan een link, bijvoorbeeld `terugslag-production.up.railway.app`.
5. Stuur die link naar je vrienden. Online spelen werkt zo:
   - De ene speler tikt op **Online 1 tegen 1** en daarna op **Nieuw duel maken**.
   - De andere speler vult de code in of tikt op het duel in de lijst.

## Bestanden

- `server.js` – deelt de game uit en geeft de online duels door via een WebSocket (`/ws`)
- `public/index.html` – de complete game
- `public/three.min.js` – de 3D-engine (three.js r128)
