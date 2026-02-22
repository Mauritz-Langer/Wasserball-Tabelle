# 🏊 Umfassende Analyse-Möglichkeiten: Wasserball-Datenbank

## Übersicht der Datenbasis

**Zeitraum:** 2011-2025 (15 Saisons)  
**Datenumfang:**
- 1,681 Ligen
- 26,463 Spiele
- 122,908 Torschützen-Einträge
- 802,529 Spielereignisse
- 479,655 Aufstellungen
- 14,622 Spieler

---

## 🎯 Analyse-Kategorien

### 1. Beschreibende Statistiken (Deskriptive Analyse)
### 2. Trend-Analysen (Zeitreihen)
### 3. Vergleichende Analysen (Komparative Analyse)
### 4. Prädiktive Analysen (Vorhersagen)
### 5. Netzwerk-Analysen (Beziehungen)
### 6. Performance-Analysen (Leistung)
### 7. Strategische Analysen (Taktik)
### 8. Fan-Engagement Analysen
### 9. Business Intelligence
### 10. Machine Learning Anwendungen

---

## 📊 1. BESCHREIBENDE STATISTIKEN

### 1.1 Team-Statistiken

**Was:** Grundlegende Leistungskennzahlen pro Team

**Analysen:**
```sql
-- Gesamt-Bilanz pro Team
SELECT 
    t.name,
    COUNT(*) as total_games,
    SUM(CASE 
        WHEN (g.home_team_id = t.id AND g.home_score > g.guest_score) 
          OR (g.guest_team_id = t.id AND g.guest_score > g.home_score) 
        THEN 1 ELSE 0 
    END) as wins,
    SUM(CASE WHEN g.home_score = g.guest_score THEN 1 ELSE 0 END) as draws,
    SUM(CASE 
        WHEN (g.home_team_id = t.id AND g.home_score < g.guest_score) 
          OR (g.guest_team_id = t.id AND g.guest_score < g.home_score) 
        THEN 1 ELSE 0 
    END) as losses,
    ROUND(100.0 * wins / total_games, 2) as win_rate
FROM teams t
JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
WHERE g.home_score IS NOT NULL
GROUP BY t.id
ORDER BY win_rate DESC;

-- Tordurchschnitt pro Team
SELECT 
    t.name,
    AVG(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.guest_score END) as avg_goals_scored,
    AVG(CASE WHEN g.home_team_id = t.id THEN g.guest_score ELSE g.home_score END) as avg_goals_conceded
FROM teams t
JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
WHERE g.home_score IS NOT NULL
GROUP BY t.id;
```

**Visualisierungen:**
- Bar Charts: Win-Rate pro Team
- Scatter Plot: Tore geschossen vs. kassiert
- Radar Charts: Team-Profile (Offensive, Defensive, Konstanz)

**Insights:**
- Erfolgreichste Teams identifizieren
- Offensive vs. Defensive Teams
- Ausgeglichenheit der Liga

---

### 1.2 Spieler-Statistiken

**Was:** Individuelle Leistungskennzahlen

**Analysen:**
```sql
-- Top Scorer aller Zeiten
SELECT 
    p.name,
    p.birth_year,
    SUM(s.goals) as career_goals,
    SUM(s.games) as career_games,
    ROUND(1.0 * SUM(s.goals) / SUM(s.games), 2) as goals_per_game,
    COUNT(DISTINCT s.league_id) as leagues_played,
    MIN(SUBSTR(s.league_id, 1, 4)) as first_season,
    MAX(SUBSTR(s.league_id, 1, 4)) as last_season
FROM players p
JOIN scorers s ON s.player_id = p.id
GROUP BY p.id
HAVING career_games >= 10
ORDER BY career_goals DESC
LIMIT 100;

-- Jüngste Top-Scorer
SELECT 
    p.name,
    2026 - p.birth_year as age,
    SUM(s.goals) as goals
FROM players p
JOIN scorers s ON s.player_id = p.id
WHERE p.birth_year >= 2005
GROUP BY p.id
ORDER BY goals DESC;

-- Spieler mit längster Karriere
SELECT 
    p.name,
    COUNT(DISTINCT SUBSTR(s.league_id, 1, 4)) as seasons,
    MIN(SUBSTR(s.league_id, 1, 4)) as first_season,
    MAX(SUBSTR(s.league_id, 1, 4)) as last_season,
    SUM(s.goals) as total_goals
FROM players p
JOIN scorers s ON s.player_id = p.id
GROUP BY p.id
ORDER BY seasons DESC;
```

**Visualisierungen:**
- Leaderboards: Top Scorer, Top Assists, etc.
- Career Progression: Tore pro Saison über Zeit
- Age Distribution: Leistung nach Altersgruppe

**Insights:**
- Hall of Fame Kandidaten
- Rising Stars (junge Talente)
- Karriere-Verläufe

---

### 1.3 Spiel-Statistiken

**Was:** Muster in Spielverläufen

**Analysen:**
```sql
-- Torreichste Spiele
SELECT 
    g.date_iso,
    t1.name as home,
    t2.name as guest,
    g.home_score,
    g.guest_score,
    g.total_goals,
    l.name as league
FROM games g
JOIN teams t1 ON g.home_team_id = t1.id
JOIN teams t2 ON g.guest_team_id = t2.id
JOIN leagues l ON g.league_id = l.id
WHERE g.total_goals IS NOT NULL
ORDER BY g.total_goals DESC
LIMIT 50;

-- Knappste Spiele
SELECT 
    t1.name as home,
    t2.name as guest,
    g.home_score,
    g.guest_score,
    g.date_iso
FROM games g
JOIN teams t1 ON g.home_team_id = t1.id
JOIN teams t2 ON g.guest_team_id = t2.id
WHERE ABS(g.goal_difference) <= 1
  AND g.home_score IS NOT NULL
ORDER BY g.total_goals DESC;

-- Durchschnittliche Tore pro Viertel
SELECT 
    qs.quarter,
    AVG(qs.home_score) as avg_home,
    AVG(qs.guest_score) as avg_guest,
    AVG(qs.home_score + qs.guest_score) as avg_total
FROM game_quarter_scores qs
GROUP BY qs.quarter
ORDER BY qs.quarter;
```

**Visualisierungen:**
- Histogramme: Verteilung der Endergebnisse
- Box Plots: Tore pro Viertel
- Heatmaps: Tore nach Spielminute

---

## 📈 2. TREND-ANALYSEN (Zeitreihen)

### 2.1 Entwicklung über Saisons

**Was:** Wie hat sich Wasserball über die Jahre verändert?

**Analysen:**
```sql
-- Durchschnittliche Tore pro Saison
SELECT 
    l.season_id,
    AVG(g.total_goals) as avg_goals,
    COUNT(*) as games,
    MAX(g.total_goals) as highest_score
FROM games g
JOIN leagues l ON g.league_id = l.id
WHERE g.total_goals IS NOT NULL
GROUP BY l.season_id
ORDER BY l.season_id;

-- Anzahl Spiele pro Saison
SELECT 
    season_id,
    COUNT(*) as games,
    COUNT(DISTINCT id) as leagues
FROM leagues l
JOIN games g ON g.league_id = l.id
GROUP BY season_id
ORDER BY season_id;

-- Entwicklung der Spielerzahl
SELECT 
    SUBSTR(league_id, 1, 4) as season,
    COUNT(DISTINCT player_id) as unique_players,
    SUM(goals) as total_goals
FROM scorers
GROUP BY season
ORDER BY season;
```

**Visualisierungen:**
- Line Charts: Tordurchschnitt über Zeit
- Area Charts: Anzahl Spieler über Zeit
- Trend Lines: Wachstum des Sports

**Insights:**
- Wird Wasserball offensiver oder defensiver?
- Wächst der Sport in Deutschland?
- Einfluss von Regeländerungen

---

### 2.2 Saisonale Muster

**Was:** Gibt es Muster über das Jahr?

**Analysen:**
```sql
-- Spiele pro Monat
SELECT 
    start_month,
    start_month_name,
    COUNT(*) as games,
    AVG(total_goals) as avg_goals
FROM games
WHERE start_month IS NOT NULL
GROUP BY start_month
ORDER BY start_month;

-- Spiele pro Wochentag
SELECT 
    start_day_of_week,
    COUNT(*) as games,
    AVG(total_goals) as avg_goals,
    AVG(home_score - guest_score) as avg_home_advantage
FROM games
WHERE start_day_of_week IS NOT NULL
GROUP BY start_day_of_week
ORDER BY 
    CASE start_day_of_week
        WHEN 'Montag' THEN 1
        WHEN 'Dienstag' THEN 2
        WHEN 'Mittwoch' THEN 3
        WHEN 'Donnerstag' THEN 4
        WHEN 'Freitag' THEN 5
        WHEN 'Samstag' THEN 6
        WHEN 'Sonntag' THEN 7
    END;

-- Spiele nach Uhrzeit
SELECT 
    start_hour,
    COUNT(*) as games,
    AVG(total_goals) as avg_goals
FROM games
WHERE start_hour IS NOT NULL
GROUP BY start_hour
ORDER BY start_hour;
```

**Visualisierungen:**
- Kalender-Heatmap: Spiele über das Jahr
- Polar Chart: Wochentag-Verteilung
- Timeline: Hauptsaison vs. Nebensaison

---

## 🔄 3. VERGLEICHENDE ANALYSEN

### 3.1 Heim- vs. Auswärtsbilanz

**Was:** Wie stark ist der Heimvorteil?

**Analysen:**
```sql
-- Heimvorteil pro Team
SELECT 
    t.name,
    -- Heimspiele
    COUNT(CASE WHEN g.home_team_id = t.id THEN 1 END) as home_games,
    SUM(CASE WHEN g.home_team_id = t.id AND g.home_score > g.guest_score THEN 1 ELSE 0 END) as home_wins,
    -- Auswärtsspiele
    COUNT(CASE WHEN g.guest_team_id = t.id THEN 1 END) as away_games,
    SUM(CASE WHEN g.guest_team_id = t.id AND g.guest_score > g.home_score THEN 1 ELSE 0 END) as away_wins,
    -- Vorteil
    ROUND(100.0 * home_wins / NULLIF(home_games, 0), 1) as home_win_rate,
    ROUND(100.0 * away_wins / NULLIF(away_games, 0), 1) as away_win_rate,
    ROUND(100.0 * home_wins / NULLIF(home_games, 0) - 100.0 * away_wins / NULLIF(away_games, 0), 1) as advantage
FROM teams t
JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
WHERE g.home_score IS NOT NULL
GROUP BY t.id
HAVING home_games >= 10 AND away_games >= 10
ORDER BY advantage DESC;

-- Durchschnittlicher Heimvorteil über alle Spiele
SELECT 
    AVG(home_score - guest_score) as avg_home_advantage,
    SUM(CASE WHEN home_score > guest_score THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as home_win_percentage
FROM games
WHERE home_score IS NOT NULL;
```

**Visualisierungen:**
- Side-by-side Bar Charts
- Difference Charts: Heimvorteil pro Team

---

### 3.2 Liga-Vergleiche

**Was:** Unterschiede zwischen Ligen/Divisions

**Analysen:**
```sql
-- Vergleich nach Liga-Level
SELECT 
    CASE 
        WHEN l.name LIKE '%Bundesliga%' THEN 'Bundesliga'
        WHEN l.name LIKE '%Oberliga%' THEN 'Oberliga'
        WHEN l.name LIKE '%Regionalliga%' THEN 'Regionalliga'
        WHEN l.name LIKE '%Landesliga%' THEN 'Landesliga'
        ELSE 'Sonstige'
    END as liga_level,
    COUNT(DISTINCT g.id) as games,
    AVG(g.total_goals) as avg_goals,
    MAX(g.total_goals) as max_goals,
    AVG(ABS(g.goal_difference)) as avg_margin
FROM leagues l
JOIN games g ON g.league_id = l.id
WHERE g.total_goals IS NOT NULL
GROUP BY liga_level
ORDER BY avg_goals DESC;

-- Regionale Unterschiede
SELECT 
    CASE 
        WHEN l.name LIKE '%Bayern%' THEN 'Bayern'
        WHEN l.name LIKE '%NRW%' OR l.name LIKE '%Westfalen%' THEN 'NRW'
        WHEN l.name LIKE '%Berlin%' THEN 'Berlin'
        WHEN l.name LIKE '%Niedersachsen%' THEN 'Niedersachsen'
        ELSE 'Andere'
    END as region,
    COUNT(*) as games,
    AVG(g.total_goals) as avg_goals
FROM leagues l
JOIN games g ON g.league_id = l.id
WHERE g.total_goals IS NOT NULL
GROUP BY region;
```

---

### 3.3 Altersgruppen-Vergleiche

**Was:** Jugend vs. Senioren

**Analysen:**
```sql
-- Performance nach Altersgruppe
SELECT 
    CASE 
        WHEN l.name LIKE '%U12%' THEN 'U12'
        WHEN l.name LIKE '%U14%' THEN 'U14'
        WHEN l.name LIKE '%U16%' THEN 'U16'
        WHEN l.name LIKE '%U18%' THEN 'U18'
        WHEN l.name LIKE '%U20%' THEN 'U20'
        ELSE 'Senioren'
    END as age_group,
    COUNT(*) as games,
    AVG(g.total_goals) as avg_goals,
    AVG(g.home_score) as avg_home,
    AVG(g.guest_score) as avg_guest
FROM leagues l
JOIN games g ON g.league_id = l.id
WHERE g.total_goals IS NOT NULL
GROUP BY age_group
ORDER BY 
    CASE age_group
        WHEN 'U12' THEN 1
        WHEN 'U14' THEN 2
        WHEN 'U16' THEN 3
        WHEN 'U18' THEN 4
        WHEN 'U20' THEN 5
        ELSE 6
    END;
```

---

## 🔮 4. PRÄDIKTIVE ANALYSEN

### 4.1 Spiel-Vorhersagen

**Was:** Kann man Spielausgänge vorhersagen?

**Features für ML-Modell:**
- Bisherige Begegnungen (Head-to-Head)
- Aktuelle Form (letzte 5 Spiele)
- Heimvorteil
- Tordurchschnitt
- Tabellen-Position
- Ausfälle/Aufstellungen

**Modelle:**
```python
# Features
features = [
    'home_team_win_rate_last_5',
    'away_team_win_rate_last_5',
    'home_team_goals_avg_last_5',
    'away_team_goals_conceded_avg_last_5',
    'head_to_head_wins_home',
    'is_weekend',
    'league_level'
]

# Ziel
target = 'home_team_wins'  # Binary: 0/1

# Algorithmen
- Logistic Regression
- Random Forest
- XGBoost
- Neural Network
```

**Evaluation:**
- Accuracy
- Precision/Recall
- ROC-AUC
- Kalibrierung

---

### 4.2 Saison-Prognosen

**Was:** Wie wird die Saison enden?

**Analysen:**
```sql
-- Aktuelle Form für Prognose
SELECT 
    t.name,
    COUNT(*) as games_played,
    SUM(CASE WHEN win THEN 1 ELSE 0 END) as wins_last_5,
    AVG(goals_scored) as avg_goals_last_5
FROM (
    SELECT 
        t.id,
        g.date_iso,
        CASE 
            WHEN g.home_team_id = t.id THEN g.home_score > g.guest_score
            ELSE g.guest_score > g.home_score
        END as win,
        CASE 
            WHEN g.home_team_id = t.id THEN g.home_score
            ELSE g.guest_score
        END as goals_scored,
        ROW_NUMBER() OVER (PARTITION BY t.id ORDER BY g.date_iso DESC) as rn
    FROM teams t
    JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
    WHERE g.date_iso IS NOT NULL
) sub
JOIN teams t ON sub.id = t.id
WHERE rn <= 5
GROUP BY t.id
ORDER BY wins_last_5 DESC, avg_goals_last_5 DESC;
```

**Simulationen:**
- Monte Carlo für Restsaison
- Aufstiegs-/Abstiegswahrscheinlichkeiten
- Meisterschafts-Chancen

---

### 4.3 Spieler-Entwicklung

**Was:** Welche Spieler werden Top-Scorer?

**Analysen:**
```sql
-- Wachstum junger Spieler
SELECT 
    p.name,
    p.birth_year,
    SUBSTR(s.league_id, 1, 4) as season,
    s.goals,
    s.games,
    ROUND(1.0 * s.goals / s.games, 2) as goals_per_game,
    LAG(s.goals) OVER (PARTITION BY p.id ORDER BY SUBSTR(s.league_id, 1, 4)) as prev_season_goals,
    s.goals - LAG(s.goals) OVER (PARTITION BY p.id ORDER BY SUBSTR(s.league_id, 1, 4)) as improvement
FROM players p
JOIN scorers s ON s.player_id = p.id
WHERE p.birth_year >= 2005
ORDER BY p.name, season;
```

---

## 🕸️ 5. NETZWERK-ANALYSEN

### 5.1 Team-Beziehungen

**Was:** Welche Teams spielen häufig gegeneinander?

**Analysen:**
```sql
-- Häufigste Paarungen
SELECT 
    t1.name as team1,
    t2.name as team2,
    COUNT(*) as encounters,
    SUM(CASE WHEN g.home_score > g.guest_score THEN 1 ELSE 0 END) as team1_wins,
    SUM(CASE WHEN g.home_score < g.guest_score THEN 1 ELSE 0 END) as team2_wins,
    SUM(CASE WHEN g.home_score = g.guest_score THEN 1 ELSE 0 END) as draws
FROM games g
JOIN teams t1 ON g.home_team_id = t1.id
JOIN teams t2 ON g.guest_team_id = t2.id
WHERE g.home_score IS NOT NULL
GROUP BY t1.id, t2.id
HAVING encounters >= 5
ORDER BY encounters DESC;
```

**Visualisierungen:**
- Network Graph: Teams als Nodes, Spiele als Edges
- Chord Diagram: Begegnungen zwischen Teams
- Adjacency Matrix

---

### 5.2 Spieler-Karriere-Pfade

**Was:** Wo wechseln Spieler hin?

**Analysen:**
```sql
-- Team-Wechsel von Spielern
SELECT 
    p.name,
    s1.team as from_team,
    s2.team as to_team,
    SUBSTR(s1.league_id, 1, 4) as from_season,
    SUBSTR(s2.league_id, 1, 4) as to_season
FROM players p
JOIN scorers s1 ON s1.player_id = p.id
JOIN scorers s2 ON s2.player_id = p.id
WHERE s1.team != s2.team
  AND SUBSTR(s2.league_id, 1, 4) = CAST(SUBSTR(s1.league_id, 1, 4) AS INTEGER) + 1
ORDER BY p.name;
```

**Visualisierungen:**
- Sankey Diagram: Spieler-Flüsse zwischen Teams
- Transfer Network

---

## ⚡ 6. PERFORMANCE-ANALYSEN

### 6.1 Clutch Performance

**Was:** Wer liefert in wichtigen Momenten?

**Analysen:**
```sql
-- Tore in knappen Spielen
SELECT 
    p.name,
    COUNT(*) as close_games,
    SUM(e.event_type = 'goal') as goals_in_close_games
FROM players p
JOIN game_lineups gl ON gl.player_id = p.id
JOIN game_events e ON e.game_id = gl.game_id AND e.player = gl.name
JOIN games g ON g.id = gl.game_id
WHERE ABS(g.goal_difference) <= 2
  AND e.event_type = 'goal'
GROUP BY p.id
ORDER BY goals_in_close_games DESC;

-- Tore im letzten Viertel
SELECT 
    e.player,
    COUNT(*) as late_goals
FROM game_events e
WHERE e.event_type = 'goal'
  AND e.period = 4
GROUP BY e.player
ORDER BY late_goals DESC;
```

---

### 6.2 Konsistenz-Analyse

**Was:** Wer ist zuverlässig?

**Analysen:**
```sql
-- Standardabweichung der Torleistung
SELECT 
    p.name,
    AVG(s.goals * 1.0 / s.games) as avg_goals_per_game,
    -- Berechne Std-Dev über Saisons
    COUNT(DISTINCT SUBSTR(s.league_id, 1, 4)) as seasons
FROM players p
JOIN scorers s ON s.player_id = p.id
GROUP BY p.id
HAVING seasons >= 3;
```

---

## 🎮 7. STRATEGISCHE ANALYSEN

### 7.1 Taktische Muster

**Was:** Welche Spielstile gibt es?

**Analysen:**
```sql
-- Offensive vs. Defensive Teams
SELECT 
    t.name,
    AVG(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.guest_score END) as avg_scored,
    AVG(CASE WHEN g.home_team_id = t.id THEN g.guest_score ELSE g.home_score END) as avg_conceded,
    AVG(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.guest_score END) - 
    AVG(CASE WHEN g.home_team_id = t.id THEN g.guest_score ELSE g.home_score END) as net_goals,
    CASE 
        WHEN AVG(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.guest_score END) > 15 THEN 'Offensiv'
        WHEN AVG(CASE WHEN g.home_team_id = t.id THEN g.guest_score ELSE g.home_score END) < 10 THEN 'Defensiv'
        ELSE 'Ausgeglichen'
    END as style
FROM teams t
JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
WHERE g.home_score IS NOT NULL
GROUP BY t.id;
```

---

### 7.2 Momentum-Analyse

**Was:** Wie entwickeln sich Teams während der Saison?

**Analysen:**
```sql
-- Win-Streak Analyse
WITH numbered_games AS (
    SELECT 
        g.home_team_id as team_id,
        g.date_iso,
        CASE WHEN g.home_score > g.guest_score THEN 1 ELSE 0 END as won,
        ROW_NUMBER() OVER (PARTITION BY g.home_team_id ORDER BY g.date_iso) as game_num
    FROM games g
    WHERE g.home_score IS NOT NULL
    UNION ALL
    SELECT 
        g.guest_team_id,
        g.date_iso,
        CASE WHEN g.guest_score > g.home_score THEN 1 ELSE 0 END as won,
        ROW_NUMBER() OVER (PARTITION BY g.guest_team_id ORDER BY g.date_iso) as game_num
    FROM games g
    WHERE g.home_score IS NOT NULL
)
SELECT 
    t.name,
    MAX(streak) as longest_win_streak
FROM teams t
JOIN (
    SELECT 
        team_id,
        COUNT(*) as streak
    FROM (
        SELECT 
            team_id,
            won,
            game_num - ROW_NUMBER() OVER (PARTITION BY team_id, won ORDER BY game_num) as grp
        FROM numbered_games
    ) sub
    WHERE won = 1
    GROUP BY team_id, grp
) streaks ON streaks.team_id = t.id
GROUP BY t.id
ORDER BY longest_win_streak DESC;
```

---

## 👥 8. FAN-ENGAGEMENT ANALYSEN

### 8.1 Attraktivste Spiele

**Was:** Welche Spiele ziehen Fans an?

**Analysen:**
```sql
-- Spiele nach Unterhaltungswert
SELECT 
    g.date_iso,
    t1.name as home,
    t2.name as guest,
    g.total_goals,
    ABS(g.goal_difference) as competitiveness,
    -- Entertainment Score (viele Tore + knappes Spiel = gut)
    g.total_goals * (5 - ABS(g.goal_difference)) as entertainment_score
FROM games g
JOIN teams t1 ON g.home_team_id = t1.id
JOIN teams t2 ON g.guest_team_id = t2.id
WHERE g.total_goals IS NOT NULL
ORDER BY entertainment_score DESC
LIMIT 100;
```

**Insights:**
- Welche Derbys sind am spannendsten?
- Beste Spiele für Marketing

---

### 8.2 Fan-Favoriten

**Was:** Beliebteste Spieler

**Analysen:**
- Meiste Tore
- Spektakulärste Aktionen
- Längste Karrieren
- Comeback-Stories

---

## 💼 9. BUSINESS INTELLIGENCE

### 9.1 Liga-Entwicklung

**Was:** Wächst der Sport?

**Analysen:**
```sql
-- Wachstum über Jahre
SELECT 
    season_id,
    COUNT(DISTINCT id) as leagues,
    COUNT(DISTINCT id) - LAG(COUNT(DISTINCT id)) OVER (ORDER BY season_id) as growth
FROM leagues
GROUP BY season_id
ORDER BY season_id;
```

---

### 9.2 Regionale Verteilung

**Was:** Wo ist Wasserball stark?

**Analysen:**
- Teams pro Bundesland
- Spieler pro Region
- Spielorte-Dichte

**Visualisierungen:**
- Choropleth Map: Deutschland nach Aktivität
- Bubble Map: Spielorte mit Größe = Anzahl Spiele

---

### 9.3 Talententwicklung

**Was:** Welche Programme funktionieren?

**Analysen:**
- Jugend → Senioren Übergangsrate
- Erfolgreiche Nachwuchs-Programme
- Vereins-Akademien Vergleich

---

## 🤖 10. MACHINE LEARNING ANWENDUNGEN

### 10.1 Empfehlungssysteme

**Was:** "Wenn du Team X magst, gefällt dir auch..."

**Algorithmen:**
- Collaborative Filtering
- Content-based Filtering
- Hybrid Approaches

---

### 10.2 Anomalie-Erkennung

**Was:** Ungewöhnliche Spiele/Leistungen

**Beispiele:**
- Überraschungssiege
- Außergewöhnliche Torleistungen
- Formeinbrüche

**Algorithmen:**
- Isolation Forest
- Local Outlier Factor
- Z-Score

---

### 10.3 Clustering

**Was:** Gruppen von ähnlichen Teams/Spielern

**Analysen:**
```python
# Features
features = [
    'avg_goals_scored',
    'avg_goals_conceded',
    'win_rate',
    'home_advantage',
    'goals_variance'
]

# K-Means Clustering
from sklearn.cluster import KMeans
kmeans = KMeans(n_clusters=5)
clusters = kmeans.fit_predict(team_features)

# Cluster-Namen
cluster_names = {
    0: 'Top Teams',
    1: 'Defensive Warriors',
    2: 'Offensive Powerhouses',
    3: 'Mid-Table',
    4: 'Struggling Teams'
}
```

**Visualisierungen:**
- PCA Plot: Teams in 2D
- Dendrogramm: Hierarchical Clustering

---

## 📊 IMPLEMENTIERUNGS-ROADMAP

### Phase 1: Quick Wins (1-2 Wochen)

**Priorität: HOCH**

1. **Basis-Dashboard**
   - Top Teams Leaderboard
   - Top Scorer Leaderboard
   - Aktuelle Tabellen
   - Letzte Ergebnisse

2. **Einfache Statistiken**
   - Durchschnittliche Tore pro Liga
   - Heimvorteil-Statistik
   - Spiele pro Monat

3. **Visualisierungen**
   - Bar Charts
   - Line Charts
   - Simple Tables

**Tools:** SQL + Plotly/Chart.js

---

### Phase 2: Erweiterte Analysen (2-4 Wochen)

**Priorität: MITTEL**

1. **Zeitreihen-Analysen**
   - Entwicklung über Saisons
   - Saisonale Muster
   - Trend-Erkennung

2. **Vergleichende Analysen**
   - Heim vs. Auswärts
   - Liga-Vergleiche
   - Team-Styles

3. **Spieler-Analysen**
   - Karriere-Verläufe
   - Altersgruppen-Vergleiche
   - Wechsel-Analyse

**Tools:** Python (Pandas, Seaborn) + D3.js

---

### Phase 3: Prädiktive Modelle (4-8 Wochen)

**Priorität: MITTEL-NIEDRIG**

1. **Spiel-Vorhersagen**
   - Feature Engineering
   - Modell-Training
   - Evaluation

2. **Saison-Prognosen**
   - Monte Carlo Simulationen
   - Aufstiegs-Chancen

3. **Spieler-Entwicklung**
   - Talent-Identifikation
   - Performance-Prognosen

**Tools:** Python (Scikit-learn, XGBoost)

---

### Phase 4: Advanced Analytics (8+ Wochen)

**Priorität: NIEDRIG**

1. **Netzwerk-Analysen**
   - Team-Beziehungen
   - Transfer-Netzwerke

2. **ML-Anwendungen**
   - Clustering
   - Anomalie-Erkennung
   - Empfehlungen

3. **Interactive Tools**
   - Explorative Dashboards
   - What-If Analysen

**Tools:** NetworkX, TensorFlow, Dash/Streamlit

---

## 🛠️ TECH-STACK EMPFEHLUNGEN

### Backend (Analysen)
- **Python 3.x**
  - Pandas (Datenmanipulation)
  - NumPy (Numerik)
  - Scikit-learn (ML)
  - Statsmodels (Statistik)

### Visualisierung
- **Plotly** (Interactive Charts)
- **Matplotlib/Seaborn** (Static Charts)
- **D3.js** (Custom Visualizations)
- **Chart.js** (Einfache Web-Charts)

### Dashboard
- **Streamlit** (Python-basiert, schnell)
- **Dash** (Python, mehr Kontrolle)
- **Angular** (Integration in bestehende App)

### Database
- **SQLite** (aktuell, gut für Analysen)
- **PostgreSQL** (für Production, wenn mehr Concurrent Access)
- **DuckDB** (optimal für Analytics)

---

## 📚 KONKRETE PROJEKT-IDEEN

### 1. **"Wasserball-Analytics Dashboard"**
**Umfang:** Medium  
**Dauer:** 4-6 Wochen  
**Features:**
- Live Tabellen
- Top Scorer
- Team-Vergleiche
- Spieler-Profile
- Trend-Charts

---

### 2. **"Predict the Winner" App**
**Umfang:** Medium-Large  
**Dauer:** 6-8 Wochen  
**Features:**
- ML-basierte Vorhersagen
- User können tippen
- Leaderboard für beste Tipper
- Erklärbare AI (warum diese Vorhersage?)

---

### 3. **"Team Optimizer"**
**Umfang:** Large  
**Dauer:** 8-12 Wochen  
**Features:**
- Optimale Aufstellung berechnen
- Spieler-Empfehlungen
- Stärken-Schwächen-Analyse
- Gegner-Vorbereitung

---

### 4. **"Wasserball-Wikipedia"**
**Umfang:** Small-Medium  
**Dauer:** 2-4 Wochen  
**Features:**
- Spieler-Enzyklopädie
- Team-Historien
- Rekorde & Statistiken
- Suchfunktion

---

### 5. **"Fantasy Wasserball"**
**Umfang:** Large  
**Dauer:** 12+ Wochen  
**Features:**
- Spieler zusammenstellen
- Punkte basierend auf Echtdaten
- Liga mit Freunden
- Live Scoring

---

## ✅ NÄCHSTE SCHRITTE

1. **Entscheide Fokus:**
   - Deskriptiv (Was ist passiert?)
   - Prädiktiv (Was wird passieren?)
   - Präskriptiv (Was sollte gemacht werden?)

2. **Wähle 2-3 Analysen** aus diesem Dokument

3. **Erstelle Prototyp** für eine Analyse

4. **Iteriere** basierend auf Erkenntnissen

5. **Skaliere** auf weitere Analysen

---

**Fragen für die Entscheidung:**
- Wer ist die Zielgruppe? (Fans, Trainer, Vereine, Medien)
- Was ist das Hauptziel? (Unterhaltung, Insights, Vorhersagen)
- Wie viel Zeit/Ressourcen stehen zur Verfügung?
- Soll es öffentlich oder intern sein?

---

**Erstellt:** 5. Februar 2026  
**Umfang:** Komplette Analyse-Roadmap  
**Nächster Schritt:** Prioritäten setzen & loslegen! 🚀
