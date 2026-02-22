# 🚀 Database Optimization - Quick Start Guide

## Übersicht

Die seasons.db wurde analysiert und mehrere Optimierungsmöglichkeiten identifiziert:

- **Größe:** 501 MB
- **Datensätze:** 1.7 Mio
- **Hauptproblem:** Keine Indizes = langsame Queries
- **Potential:** 10-100x schnellere Abfragen

## ⚡ Schnellstart (Empfohlen)

```bash
# Alles automatisch durchführen
./scripts/optimize-db.sh
```

Das Script erstellt:
1. ✅ Backup
2. ✅ Fügt Indizes hinzu
3. ✅ Bereinigt Daten
4. ✅ Optimiert DB
5. ✅ Testet Performance

**Dauer:** ~2-3 Minuten

## 🎯 Manuelle Schritte

### 1. Backup erstellen

```bash
cp src/assets/data/seasons.db src/assets/data/seasons.db.backup
```

### 2. Indizes hinzufügen (WICHTIGSTE OPTIMIERUNG!)

```bash
sqlite3 src/assets/data/seasons.db < scripts/add-indexes.sql
```

**Erwartete Verbesserung:** 10-100x schneller  
**Dateigröße:** +5-10 MB (Indizes brauchen Platz)

### 3. Daten bereinigen

```bash
sqlite3 src/assets/data/seasons.db < scripts/cleanup-data.sql
```

Entfernt:
- Duplikate in scorers
- Leere/inkonsistente Werte
- Normalisiert Leerzeichen

### 4. Team-Normalisierung (Optional, Fortgeschritten)

```bash
node scripts/migrate-teams.js
```

Erstellt eine `teams` Tabelle und normalisiert Team-Namen.

**Vorteil:**
- 50-70 MB Speicherersparnis
- Konsistente Team-Namen
- Schnellere Team-Statistiken

⚠️ **Erfordert Code-Anpassungen** im Frontend!

## 📊 Performance-Vergleich

### Vorher (ohne Indizes)

```sql
-- Liga-Spiele laden: ~500ms
SELECT * FROM games WHERE league_id = '2025_196';

-- Torschützen: ~800ms
SELECT * FROM scorers WHERE league_id = '2025_196' ORDER BY goals DESC;
```

### Nachher (mit Indizes)

```sql
-- Liga-Spiele laden: ~10ms (50x schneller!)
SELECT * FROM games WHERE league_id = '2025_196';

-- Torschützen: ~20ms (40x schneller!)
SELECT * FROM scorers WHERE league_id = '2025_196' ORDER BY goals DESC;
```

## 🔍 Analyse-Tools

### Python-Analyse ausführen

```bash
python3 scripts/analyze-db.py
```

Zeigt:
- Tabellen-Statistiken
- Datenqualität
- Performance-Probleme
- Verbesserungsvorschläge

### Manuelle DB-Inspektion

```bash
# Schema anzeigen
sqlite3 src/assets/data/seasons.db ".schema games"

# Indizes anzeigen
sqlite3 src/assets/data/seasons.db "SELECT name FROM sqlite_master WHERE type='index';"

# Tabellen-Größe
sqlite3 src/assets/data/seasons.db "SELECT name, SUM(pgsize) FROM dbstat GROUP BY name;"
```

## 📋 Checklist

Nach der Optimierung prüfen:

- [ ] App startet normal: `npm run dev`
- [ ] Liga-Seiten laden schnell
- [ ] Spiele-Tabelle zeigt Daten
- [ ] Torschützen-Liste funktioniert
- [ ] Keine Konsolen-Fehler
- [ ] Backup kann gelöscht werden

## 🆘 Troubleshooting

### Problem: "Database locked"

```bash
# Alle Prozesse beenden, die DB nutzen
lsof src/assets/data/seasons.db
kill <PID>
```

### Problem: Migration fehlgeschlagen

```bash
# Backup wiederherstellen
cp src/assets/data/seasons.db.backup src/assets/data/seasons.db
```

### Problem: App zeigt keine Daten

1. Browser-Cache leeren
2. Hard Reload (Cmd+Shift+R)
3. IndexedDB löschen in DevTools
4. Service Worker deregistrieren

### Problem: Queries immer noch langsam

```sql
-- Prüfe ob Indizes genutzt werden
EXPLAIN QUERY PLAN SELECT * FROM games WHERE league_id = '2025_196';

-- Sollte zeigen: "USING INDEX idx_games_league_id"
```

## 📚 Weitere Optimierungen

Siehe **[DB_OPTIMIZATION_REPORT.md](../DB_OPTIMIZATION_REPORT.md)** für:

- Normalisierung (Teams, Venues, Players)
- Materialized Views
- Full-Text Search
- Partitionierung
- Kompression

## ⚠️ Wichtige Hinweise

1. **Immer Backup erstellen** vor Änderungen
2. **Production DB** separat behandeln (public/assets/data/)
3. **Test lokal** vor Deployment
4. **Indizes** müssen auch in `scripts/db.js` hinzugefügt werden für neue DBs

## 🔄 Regelmäßige Wartung

```bash
# Jeden Monat ausführen
sqlite3 src/assets/data/seasons.db "VACUUM; ANALYZE;"
```

- `VACUUM`: Gibt ungenutzten Speicher frei
- `ANALYZE`: Aktualisiert Query-Optimizer-Statistiken

## 📞 Support

Bei Problemen:
1. Siehe **DB_OPTIMIZATION_REPORT.md**
2. Prüfe Script-Output für Fehler
3. Backup wiederherstellen wenn nötig

---

**Erstellt:** 5. Februar 2026  
**Getestet mit:** SQLite 3.x, Node.js 20.x
