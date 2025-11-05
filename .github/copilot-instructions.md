# Copilot Instructions - Wasserball-Tabelle

## Projektübersicht

Dies ist eine Angular 18-Webanwendung zur Anzeige von Wasserball-Ligen, Spielplänen, Tabellen und Torschützenlisten. Die App scrapt Daten von der DSV (Deutscher Schwimm-Verband) Website und bereitet sie benutzerfreundlich auf.

## Technologie-Stack

### Frontend
- **Framework**: Angular 18 (Standalone Components)
- **UI-Bibliothek**: Angular Material 18
- **Styling**: SCSS
- **Animationen**: Angular Animations
- **HTTP-Client**: Angular HttpClient mit RxJS
- **TypeScript**: Version 5.4.2

### Backend/API
- **Proxy**: Vercel Edge Functions (Production) / Angular Dev Proxy (Development)
- **Zielsystem**: https://dsvdaten.dsv.de
- **Datenquelle**: HTML-Scraping vom DSV-Server

### Build & Deployment
- **Build-Tool**: Angular CLI
- **Deployment**: Vercel
- **Testing**: Jasmine & Karma

## Projektstruktur

```
src/app/
├── components/           # UI-Komponenten
│   ├── game-details/    # Spiel-Detail-Ansicht (NEU seit Nov 2025)
│   ├── liga/            # Liga-Detail-Ansicht (Spiele, Tabelle, Torschützen)
│   └── overview/        # Übersicht aller Ligen
├── models/              # TypeScript-Interfaces für Datenmodelle
│   ├── game-details.ts  # Spiel-Detail-Datenmodelle (NEU)
│   ├── games.ts         # Spiel-Datenmodell
│   ├── table.ts         # Tabellen-Datenmodell
│   ├── scorer.ts        # Torschützen-Datenmodell
│   ├── item.ts          # Übersichts-Item (Kategorien)
│   └── subItem.ts       # Sub-Items (einzelne Ligen)
├── services/            # Services für Datenverarbeitung
│   ├── api-proxy/       # API-URL-Verwaltung
│   ├── game-details/    # Spiel-Details-Service (NEU)
│   ├── liga/            # Liga-Daten-Service
│   └── overview/        # Übersichts-Service
└── environments/        # Umgebungskonfigurationen

api/
└── proxy.ts            # Vercel Edge Function für CORS-Proxy
```

## Architektur-Prinzipien

### 1. Standalone Components
- Alle Komponenten sind **standalone** (kein NgModule)
- Imports werden direkt in der Component-Decorator angegeben
- App-Konfiguration erfolgt über `app.config.ts`

### 2. Dependency Injection
- Services sind `providedIn: 'root'` (Singleton)
- HttpClient wird über `provideHttpClient()` in der App-Config bereitgestellt

### 3. Routing
- Routes werden in `app.routes.ts` definiert
- Verwendung von Query-Parameters für Liga-IDs (`?param=...`)

### 4. State Management
- Einfaches Component-basiertes State Management
- LocalStorage für persistente Favoriten
- Kein globaler State Management (NgRx/Akita nicht verwendet)

## Wichtige Code-Patterns

### HTML-Parsing
Die App nutzt den nativen Browser `DOMParser` zum Parsen von HTML:

```typescript
const parser = new DOMParser();
const doc = parser.parseFromString(html, 'text/html');
```

**Wichtig**: Vor dem Parsen wird HTML bereinigt:
- `<nobr>` Tags werden entfernt
- `target=_blank` Attribute werden entfernt

### Material Table mit MatTableDataSource
Alle Tabellen verwenden `MatTableDataSource` für:
- Filterung
- Sortierung (falls implementiert)
- Datenmanagement

Beispiel:
```typescript
dataSourceGames: MatTableDataSource<Games> = new MatTableDataSource();
```

### Expandable Rows (Tabellen-Details)
Die Tabellen-Ansicht nutzt Angular Animations für erweiterbare Zeilen:
- `expandedElement` speichert das aktuell erweiterte Element
- `detailExpand` Animation für smooth transitions
- `multiTemplateDataRows` für verschachtelte Zeilen

### API-Proxy-Pattern
Alle API-Anfragen laufen über den Proxy-Service:

```typescript
const url = this.apiProxy.getApiUrl('/Modules/WB/...');
this.http.get(url, {responseType: 'text'})
```

**Entwicklung**: Angular Dev Proxy (`proxy.conf.js`)
**Produktion**: Vercel Edge Function (`api/proxy.ts`)

## Datenmodelle

### Games (Spiele)
```typescript
interface Games {
  start: string;          // Datum/Zeit im Format "DD.MM.YY, HH:MM Uhr"
  home: string;           // Heim-Team
  homeImageUrl: string;   // Team-Logo URL (Base64 oder https)
  guest: string;          // Gast-Team
  guestImageUrl: string;  // Team-Logo URL
  location: string;       // Spielort
  gameLink: string;       // Link zu Spieldetails (relativ)
  result: string;         // Ergebnis "X:Y" oder " - "
}
```

### Table (Tabelle)
```typescript
interface Table {
  place: number;          // Tabellenplatz
  team: string;           // Teamname
  info: string;           // Zusatzinfo (z.B. "1. Mannschaft")
  imageUrl: string;       // Team-Logo
  games: number;          // Anzahl Spiele
  wins: number;           // Siege
  draws: number;          // Unentschieden
  losses: number;         // Niederlagen
  goals: string;          // Tore "X:Y"
  goalDifference: number; // Tordifferenz
  points: number;         // Punkte
}
```

### Scorer (Torschützen)
```typescript
interface Scorer {
  place: number;    // Platzierung
  name: string;     // Spielername
  team: string;     // Teamname
  goals: number;    // Anzahl Tore
  games: number;    // Anzahl Spiele
}
```

## Styling-Konventionen

### Responsive Design
- Mobile-first Ansatz mit `@media (max-width: 768px)`
- Anpassung von Schriftgrößen, Abständen und Logo-Größen

### Team-Logos
Drei Größen:
- `team-logo`: 40px (Standard in Tabellen)
- `team-logo-large`: 64px (Header)
- `team-logo-small`: 28px (Spiel-Cards)

### Farbcodierung (Spiel-Ergebnisse)
- **Gewonnen**: Grün (`#4caf50`, Hintergrund `#f1f8f4`)
- **Verloren**: Rot (`#f44336`, Hintergrund `#fef5f5`)
- **Unentschieden**: Orange (`#ff9800`, Hintergrund `#fff8f0`)

### Material Design
- Verwendung von Material 3 Theming
- Elevation mit `mat-elevation-z8`
- Material Typography (`mat-headline-1`, etc.)

## Besondere Features

### 1. Favoriten-System
- Ligen können als Favoriten markiert werden
- Persistierung in LocalStorage
- Favoriten werden in der Overview prominent angezeigt

### 2. Vergangene Spiele
- Spiele in der Vergangenheit werden grau hinterlegt
- Prüfung über `checkEventInPast()` basierend auf aktuellem Datum

### 3. Maps-Integration
- Klick auf Spielort öffnet Google Maps
- Location-Link wird über separate API-Anfrage geladen
- Verwendung von `getLocationLink()` mit async/await

### 4. Filter-Funktion
- Suche in Spielen und Torschützen
- Real-time Filterung über MatTableDataSource

### 5. Image-Handling
Unterstützt verschiedene Bildformate:
- Base64-encoded Images (`data:image/...`)
- External URLs (`https://...`)
- DSV-relative Pfade (werden zu absoluten URLs konvertiert)

## Development-Workflow

### Lokale Entwicklung
```bash
npm install
ng serve
# App läuft auf http://localhost:4200
# Proxy leitet /api/* nach dsvdaten.dsv.de um
```

### Testing
```bash
ng test  # Unit Tests mit Karma
```

### Build
```bash
ng build  # Production Build -> dist/
```

### Deployment
- Automatisches Deployment via Vercel
- Edge Function ersetzt Dev Proxy
- Konfiguration in `vercel.json`

## Best Practices für Erweiterungen

### 1. Neue Komponente hinzufügen
```bash
ng generate component components/neue-komponente
```
- Mache die Komponente `standalone: true`
- Importiere benötigte Material-Module direkt
- Füge Route in `app.routes.ts` hinzu

### 2. Neuer Service
```bash
ng generate service services/neuer-service/neuer-service
```
- Verwende `providedIn: 'root'`
- Injiziere HttpClient und ApiProxyService bei Bedarf
- Nutze RxJS Observables für asynchrone Operationen

### 3. Neues Datenmodell
- Erstelle Interface in `models/`
- Exportiere Interface
- Dokumentiere Feldtypen und -bedeutung

### 4. HTML-Scraping erweitern
Wenn DSV-Website neue Elemente hat:
1. Inspiziere HTML-Struktur im Browser
2. Suche nach ID oder eindeutigem Selektor
3. Bereinige HTML vor dem Parsen
4. Nutze `getElementById()` oder `querySelector()`
5. Füge Fehlerbehandlung hinzu (`try/catch`)

### 5. Material Components nutzen
Wichtige Module:
- `MatTableModule` (bereits genutzt)
- `MatTabsModule` (bereits genutzt)
- `MatFormFieldModule` (bereits genutzt)
- `MatInputModule` (bereits genutzt)
- `MatButtonModule` (bereits genutzt)
- `MatIconModule` (bereits genutzt)
- `MatProgressSpinnerModule` (bereits genutzt)

Importiere direkt die Standalone-Imports (z.B. `MatTable`, `MatCell`)

## Häufige Probleme & Lösungen

### Problem: CORS-Fehler
**Lösung**: Stelle sicher, dass API-Anfragen über `/api/*` laufen und der Proxy konfiguriert ist.

### Problem: HTML-Parsing schlägt fehl
**Lösung**: 
- Prüfe, ob DSV-Website Struktur geändert hat
- Nutze Browser DevTools zum Inspizieren
- Teste mit bereinigtem HTML

### Problem: Team-Logos werden nicht angezeigt
**Lösung**:
- Prüfe Base64-Encoding
- Verifiziere URL-Konstruktion in `extractTeamImages()`
- Checke CORS für externe Bild-URLs

### Problem: Datum-Parsing funktioniert nicht
**Lösung**:
- Deutsche Datumsformate: "DD.MM.YY, HH:MM Uhr"
- Beachte Jahr: "25" = 2025 (2000 + year)
- Zeitzone beachten bei Vergleichen

## Debugging-Tipps

### Console-Logging
Services enthalten bereits console.error für Fehler. Bei Bedarf:
```typescript
console.log('Parsed data:', data);
console.warn('Unexpected structure:', element);
```

### Angular DevTools
Nutze Angular DevTools Browser-Extension für:
- Component Inspector
- Dependency Injection Tree
- Change Detection Profiler

### Network Tab
Überprüfe Proxy-Anfragen:
- Sollten zu `localhost:4200/api/*` gehen
- Response sollte HTML-Text sein
- Status 200 OK

## Code-Style

### TypeScript
- Nutze explizite Typen wo möglich
- Verwende Interfaces statt Types
- Bevorzuge `const` über `let`
- Arrow Functions für Callbacks

### HTML
- Nutze Angular-Syntax: `*ngIf`, `*ngFor`, `@for` (neue Control Flow)
- Bindings: `[property]="value"` und `(event)="handler()"`
- Zwei-Wege-Binding: `[(ngModel)]="value"`

### SCSS
- Nutze Verschachtelung sinnvoll (max. 3 Ebenen)
- Media Queries innerhalb der Komponente
- Verwende Material-Variablen wo möglich

## Zukünftige Erweiterungen (Ideen)

- [ ] Sortierung in Tabellen
- [ ] Dark Mode
- [ ] PWA-Support (Service Worker)
- [ ] Push-Notifications für Favoriten-Spiele
- [ ] Spiel-Details-Ansicht
- [ ] Spieler-Statistiken
- [ ] Export-Funktionen (CSV, PDF)
- [ ] Multi-Saison-Support
- [ ] Backend mit Datenbank-Cache
- [ ] Verlaufs-Grafiken (Charts.js / ngx-charts)

## Wichtige Links

- [Angular Docs](https://angular.dev)
- [Angular Material](https://material.angular.io)
- [RxJS](https://rxjs.dev)
- [DSV Datenbank](https://dsvdaten.dsv.de)
- [Vercel Docs](https://vercel.com/docs)

## Kontakt & Wartung

Bei Fragen zum Projekt:
1. Prüfe diese Dokumentation
2. Schaue in bestehende Implementierungen
3. Teste Änderungen lokal vor Deployment
4. DSV-Website-Änderungen können Scraping brechen - regelmäßig testen

---

**Letzte Aktualisierung**: November 2025
**Angular Version**: 18.0.0
**Node Version**: Empfohlen LTS (20.x oder höher)

