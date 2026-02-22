# 📊 Visualisierungs-Guide für Wasserball Analytics

## Übersicht

Dieser Guide zeigt dir die **besten Visualisierungsmethoden** für deine Wasserball-Daten mit konkreten Code-Beispielen in verschiedenen Technologien.

---

## 🎨 3 Haupt-Ansätze

### 1. **Python (Schnelle Prototypen)** ⚡
**Beste für:** Explorative Analysen, schnelle Insights, Reports

### 2. **Angular + Chart.js (Web Dashboard)** 🌐
**Beste für:** Interactive Dashboards, Produktions-App

### 3. **Jupyter Notebook (Interaktive Reports)** 📓
**Beste für:** Detaillierte Analysen, Präsentationen

---

## 🐍 1. PYTHON VISUALISIERUNGEN

### Setup

```bash
pip install pandas matplotlib seaborn plotly
```

### 1.1 Bar Charts - Top Teams

```python
import sqlite3
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Stil setzen
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (12, 6)

# Daten laden
conn = sqlite3.connect('src/assets/data/seasons.db')
query = """
SELECT 
    t.name,
    COUNT(*) as games,
    ROUND(100.0 * SUM(CASE 
        WHEN (g.home_team_id = t.id AND g.home_score > g.guest_score) 
          OR (g.guest_team_id = t.id AND g.guest_score > g.home_score) 
        THEN 1 ELSE 0 
    END) / COUNT(*), 1) as win_rate
FROM teams t
JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
WHERE g.home_score IS NOT NULL
GROUP BY t.id
HAVING games >= 20
ORDER BY win_rate DESC
LIMIT 20
"""
df = pd.read_sql_query(query, conn)

# Visualisierung
fig, ax = plt.subplots(figsize=(14, 8))
bars = ax.barh(df['name'], df['win_rate'], color='steelblue')

# Gradient Farben basierend auf Wert
colors = plt.cm.RdYlGn(df['win_rate'] / 100)
for bar, color in zip(bars, colors):
    bar.set_color(color)

ax.set_xlabel('Siegquote (%)', fontsize=12)
ax.set_title('Top 20 Teams - Siegquote', fontsize=16, fontweight='bold')
ax.invert_yaxis()

# Werte auf Balken anzeigen
for i, v in enumerate(df['win_rate']):
    ax.text(v + 1, i, f'{v}%', va='center', fontsize=10)

plt.tight_layout()
plt.savefig('top_teams.png', dpi=300, bbox_inches='tight')
plt.show()
```

### 1.2 Line Chart - Trends über Zeit

```python
# Tore über Saisons
query = """
SELECT 
    l.season_id,
    AVG(g.total_goals) as avg_goals,
    MAX(g.total_goals) as max_goals,
    COUNT(*) as games
FROM leagues l
JOIN games g ON g.league_id = l.id
WHERE g.total_goals IS NOT NULL
GROUP BY l.season_id
ORDER BY l.season_id
"""
df_trends = pd.read_sql_query(query, conn)

fig, ax = plt.subplots(figsize=(14, 6))

# Linien
ax.plot(df_trends['season_id'], df_trends['avg_goals'], 
        marker='o', linewidth=2, label='Durchschnitt', color='steelblue')
ax.fill_between(df_trends['season_id'], df_trends['avg_goals'], 
                alpha=0.3, color='steelblue')

ax.set_xlabel('Saison', fontsize=12)
ax.set_ylabel('Durchschnittliche Tore pro Spiel', fontsize=12)
ax.set_title('Entwicklung der Tore über Saisons', fontsize=16, fontweight='bold')
ax.grid(True, alpha=0.3)
ax.legend()

# Trend-Linie
z = np.polyfit(range(len(df_trends)), df_trends['avg_goals'], 1)
p = np.poly1d(z)
ax.plot(df_trends['season_id'], p(range(len(df_trends))), 
        "--", color='red', alpha=0.8, label='Trend')

plt.tight_layout()
plt.savefig('trends.png', dpi=300)
plt.show()
```

### 1.3 Scatter Plot - Tore geschossen vs. kassiert

```python
query = """
SELECT 
    t.name,
    AVG(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.guest_score END) as avg_scored,
    AVG(CASE WHEN g.home_team_id = t.id THEN g.guest_score ELSE g.home_score END) as avg_conceded,
    COUNT(*) as games
FROM teams t
JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
WHERE g.home_score IS NOT NULL
GROUP BY t.id
HAVING games >= 30
"""
df_scatter = pd.read_sql_query(query, conn)

fig, ax = plt.subplots(figsize=(12, 8))

# Scatter mit Größe = Anzahl Spiele
scatter = ax.scatter(df_scatter['avg_scored'], df_scatter['avg_conceded'], 
                    s=df_scatter['games']*2, alpha=0.6, c=df_scatter['avg_scored'], 
                    cmap='RdYlGn')

# Diagonale (gleich viele Tore geschossen wie kassiert)
ax.plot([0, 20], [0, 20], 'k--', alpha=0.3, label='Ausgeglichen')

# Quadranten
ax.axhline(y=df_scatter['avg_conceded'].median(), color='gray', linestyle='--', alpha=0.3)
ax.axvline(x=df_scatter['avg_scored'].median(), color='gray', linestyle='--', alpha=0.3)

# Labels für Top Teams
for idx, row in df_scatter.nlargest(5, 'avg_scored').iterrows():
    ax.annotate(row['name'], (row['avg_scored'], row['avg_conceded']),
                xytext=(5, 5), textcoords='offset points', fontsize=8)

ax.set_xlabel('Durchschnittlich geschossene Tore', fontsize=12)
ax.set_ylabel('Durchschnittlich kassierte Tore', fontsize=12)
ax.set_title('Team-Profile: Offensive vs. Defensive', fontsize=16, fontweight='bold')
ax.legend()
plt.colorbar(scatter, label='Geschossene Tore')

plt.tight_layout()
plt.savefig('team_profiles.png', dpi=300)
plt.show()
```

### 1.4 Heatmap - Spiele über Jahr

```python
import numpy as np

query = """
SELECT 
    start_year,
    start_month,
    COUNT(*) as games
FROM games
WHERE start_year IS NOT NULL AND start_month IS NOT NULL
GROUP BY start_year, start_month
ORDER BY start_year, start_month
"""
df_heat = pd.read_sql_query(query, conn)

# Pivot für Heatmap
heatmap_data = df_heat.pivot(index='start_month', columns='start_year', values='games')
heatmap_data = heatmap_data.fillna(0)

fig, ax = plt.subplots(figsize=(16, 8))
sns.heatmap(heatmap_data, annot=True, fmt='.0f', cmap='YlOrRd', 
            linewidths=0.5, cbar_kws={'label': 'Anzahl Spiele'})

ax.set_xlabel('Saison', fontsize=12)
ax.set_ylabel('Monat', fontsize=12)
ax.set_title('Spiele-Heatmap über Jahre', fontsize=16, fontweight='bold')

# Monatsnamen
month_names = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 
               'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
ax.set_yticklabels(month_names, rotation=0)

plt.tight_layout()
plt.savefig('heatmap.png', dpi=300)
plt.show()
```

### 1.5 Pie Chart - Heimvorteil

```python
query = """
SELECT 
    CASE 
        WHEN home_score > guest_score THEN 'Heimsieg'
        WHEN home_score < guest_score THEN 'Auswärtssieg'
        ELSE 'Unentschieden'
    END as result,
    COUNT(*) as count
FROM games
WHERE home_score IS NOT NULL
GROUP BY result
"""
df_pie = pd.read_sql_query(query, conn)

fig, ax = plt.subplots(figsize=(10, 8))

colors = ['#2ecc71', '#e74c3c', '#95a5a6']
explode = (0.1, 0, 0)  # Heimsieg hervorheben

wedges, texts, autotexts = ax.pie(df_pie['count'], 
                                    labels=df_pie['result'],
                                    autopct='%1.1f%%',
                                    colors=colors,
                                    explode=explode,
                                    startangle=90,
                                    textprops={'fontsize': 12})

# Styling
for autotext in autotexts:
    autotext.set_color('white')
    autotext.set_fontweight('bold')

ax.set_title('Verteilung der Spielausgänge - Heimvorteil', 
             fontsize=16, fontweight='bold')

plt.tight_layout()
plt.savefig('home_advantage.png', dpi=300)
plt.show()
```

### 1.6 Plotly - Interactive Chart

```python
import plotly.graph_objects as go
import plotly.express as px

# Top Scorer Interactive
query = """
SELECT 
    p.name,
    SUM(s.goals) as goals,
    SUM(s.games) as games,
    ROUND(1.0 * SUM(s.goals) / SUM(s.games), 2) as goals_per_game
FROM players p
JOIN scorers s ON s.player_id = p.id
GROUP BY p.id
HAVING games >= 10
ORDER BY goals DESC
LIMIT 30
"""
df_scorers = pd.read_sql_query(query, conn)

fig = px.bar(df_scorers, x='name', y='goals', 
             title='Top 30 Torschützen',
             color='goals_per_game',
             color_continuous_scale='Viridis',
             hover_data=['games', 'goals_per_game'])

fig.update_layout(
    xaxis_tickangle=-45,
    height=600,
    font=dict(size=12)
)

fig.write_html('top_scorers_interactive.html')
fig.show()
```

---

## 🌐 2. ANGULAR + CHART.JS

### Setup

```bash
npm install chart.js ng2-charts --save
```

### 2.1 Component erstellen

```bash
ng generate component components/analytics
ng generate service services/analytics/analytics
```

### 2.2 Analytics Service

```typescript
// services/analytics/analytics.service.ts
import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '../database/database.service';

export interface TeamStat {
  name: string;
  games: number;
  winRate: number;
  avgScored: number;
  avgConceded: number;
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private db = inject(DatabaseService);

  async getTopTeams(limit: number = 20): Promise<TeamStat[]> {
    await this.db.ensureDbLoaded();
    
    const query = `
      SELECT 
        t.name,
        COUNT(*) as games,
        ROUND(100.0 * SUM(CASE 
          WHEN (g.home_team_id = t.id AND g.home_score > g.guest_score) 
            OR (g.guest_team_id = t.id AND g.guest_score > g.home_score) 
          THEN 1 ELSE 0 
        END) / COUNT(*), 1) as winRate,
        ROUND(AVG(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.guest_score END), 2) as avgScored,
        ROUND(AVG(CASE WHEN g.home_team_id = t.id THEN g.guest_score ELSE g.home_score END), 2) as avgConceded
      FROM teams t
      JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
      WHERE g.home_score IS NOT NULL
      GROUP BY t.id
      HAVING games >= 20
      ORDER BY winRate DESC
      LIMIT ?
    `;
    
    return await this.db.query(query, [limit]);
  }

  async getTrendsOverTime(): Promise<any[]> {
    await this.db.ensureDbLoaded();
    
    const query = `
      SELECT 
        l.season_id,
        ROUND(AVG(g.total_goals), 2) as avgGoals,
        COUNT(*) as games
      FROM leagues l
      JOIN games g ON g.league_id = l.id
      WHERE g.total_goals IS NOT NULL
      GROUP BY l.season_id
      ORDER BY l.season_id
    `;
    
    return await this.db.query(query);
  }
}
```

### 2.3 Analytics Component

```typescript
// components/analytics/analytics.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';
import { AnalyticsService } from '../../services/analytics/analytics.service';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.scss']
})
export class AnalyticsComponent implements OnInit {
  private analyticsService = inject(AnalyticsService);

  // Chart Configs
  public barChartType: ChartType = 'bar';
  public lineChartType: ChartType = 'line';
  
  public topTeamsChartData: ChartConfiguration['data'] = {
    labels: [],
    datasets: [{
      data: [],
      label: 'Siegquote (%)',
      backgroundColor: 'rgba(54, 162, 235, 0.7)',
      borderColor: 'rgba(54, 162, 235, 1)',
      borderWidth: 1
    }]
  };

  public topTeamsChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    indexAxis: 'y',
    plugins: {
      legend: {
        display: true,
      },
      title: {
        display: true,
        text: 'Top 20 Teams - Siegquote',
        font: { size: 16 }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Siegquote (%)'
        }
      }
    }
  };

  public trendsChartData: ChartConfiguration['data'] = {
    labels: [],
    datasets: [{
      data: [],
      label: 'Durchschnittliche Tore',
      fill: true,
      backgroundColor: 'rgba(75, 192, 192, 0.2)',
      borderColor: 'rgba(75, 192, 192, 1)',
      tension: 0.4
    }]
  };

  public trendsChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: {
      legend: {
        display: true,
      },
      title: {
        display: true,
        text: 'Tor-Entwicklung über Saisons',
        font: { size: 16 }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Durchschnittliche Tore pro Spiel'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Saison'
        }
      }
    }
  };

  async ngOnInit() {
    await this.loadTopTeams();
    await this.loadTrends();
  }

  private async loadTopTeams() {
    const teams = await this.analyticsService.getTopTeams();
    
    this.topTeamsChartData = {
      labels: teams.map(t => t.name),
      datasets: [{
        data: teams.map(t => t.winRate),
        label: 'Siegquote (%)',
        backgroundColor: teams.map((t, i) => {
          // Gradient von rot zu grün
          const ratio = t.winRate / 100;
          const r = Math.round(255 * (1 - ratio));
          const g = Math.round(255 * ratio);
          return `rgba(${r}, ${g}, 50, 0.7)`;
        }),
        borderWidth: 1
      }]
    };
  }

  private async loadTrends() {
    const trends = await this.analyticsService.getTrendsOverTime();
    
    this.trendsChartData = {
      labels: trends.map(t => t.season_id),
      datasets: [{
        data: trends.map(t => t.avgGoals),
        label: 'Durchschnittliche Tore',
        fill: true,
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        tension: 0.4
      }]
    };
  }
}
```

### 2.4 Template

```html
<!-- components/analytics/analytics.component.html -->
<div class="analytics-container">
  <h1>Wasserball Analytics</h1>
  
  <div class="charts-grid">
    <!-- Top Teams Chart -->
    <mat-card class="chart-card">
      <mat-card-header>
        <mat-card-title>Top Teams</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <canvas baseChart
                [data]="topTeamsChartData"
                [options]="topTeamsChartOptions"
                [type]="barChartType">
        </canvas>
      </mat-card-content>
    </mat-card>

    <!-- Trends Chart -->
    <mat-card class="chart-card">
      <mat-card-header>
        <mat-card-title>Trends über Zeit</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <canvas baseChart
                [data]="trendsChartData"
                [options]="trendsChartOptions"
                [type]="lineChartType">
        </canvas>
      </mat-card-content>
    </mat-card>
  </div>
</div>
```

### 2.5 Styling

```scss
// components/analytics/analytics.component.scss
.analytics-container {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;

  h1 {
    margin-bottom: 30px;
    text-align: center;
  }
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(600px, 1fr));
  gap: 24px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.chart-card {
  mat-card-content {
    padding: 20px;
    min-height: 400px;
  }
}
```

---

## 📓 3. JUPYTER NOTEBOOK

### Setup

```bash
pip install jupyter pandas matplotlib seaborn plotly
jupyter notebook
```

### Notebook Struktur

```python
# Zelle 1: Imports & Setup
import sqlite3
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import plotly.graph_objects as go
from IPython.display import display, HTML

# Style
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (14, 6)
%matplotlib inline

# DB Connection
conn = sqlite3.connect('src/assets/data/seasons.db')

# Zelle 2: Daten-Übersicht
print("📊 DATENBANK-ÜBERSICHT")
print("="*80)

tables = ['seasons', 'leagues', 'games', 'teams', 'players', 'scorers']
for table in tables:
    count = pd.read_sql_query(f"SELECT COUNT(*) as c FROM {table}", conn).iloc[0]['c']
    print(f"{table:20} {count:>10,} Einträge")

# Zelle 3: Top Teams Analyse
df_teams = pd.read_sql_query("""
    SELECT 
        t.name,
        COUNT(*) as games,
        SUM(CASE 
            WHEN (g.home_team_id = t.id AND g.home_score > g.guest_score) 
              OR (g.guest_team_id = t.id AND g.guest_score > g.home_score) 
            THEN 1 ELSE 0 
        END) as wins,
        ROUND(100.0 * SUM(CASE 
            WHEN (g.home_team_id = t.id AND g.home_score > g.guest_score) 
              OR (g.guest_team_id = t.id AND g.guest_score > g.home_score) 
            THEN 1 ELSE 0 
        END) / COUNT(*), 1) as win_rate
    FROM teams t
    JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
    WHERE g.home_score IS NOT NULL
    GROUP BY t.id
    HAVING games >= 20
    ORDER BY win_rate DESC
    LIMIT 20
""", conn)

display(df_teams)

# Interactive Plotly Chart
fig = px.bar(df_teams, x='name', y='win_rate', 
             title='Top 20 Teams - Siegquote',
             color='win_rate',
             color_continuous_scale='RdYlGn',
             hover_data=['games', 'wins'])
fig.update_layout(xaxis_tickangle=-45, height=600)
fig.show()

# Zelle 4: Weitere Analysen...
```

---

## 🎨 BEST PRACTICES

### 1. Farbpaletten

```python
# Professionelle Farbschemata
custom_colors = {
    'primary': '#1f77b4',
    'success': '#2ecc71',
    'danger': '#e74c3c',
    'warning': '#f39c12',
    'info': '#3498db'
}

# Seaborn Paletten
sns.color_palette("husl", 10)  # Bunte Farben
sns.color_palette("RdYlGn", 10)  # Rot-Gelb-Grün
sns.color_palette("viridis", 10)  # Perceptually uniform
```

### 2. Responsive Design

```python
# Automatische Figsize
import matplotlib.pyplot as plt
from matplotlib import rcParams

# Für Presentation
rcParams['figure.figsize'] = (16, 9)

# Für Reports
rcParams['figure.figsize'] = (12, 6)

# Für Mobile
rcParams['figure.figsize'] = (10, 6)
```

### 3. Interaktivität

```python
# Plotly für Web
import plotly.graph_objects as go

fig = go.Figure()
fig.add_trace(go.Scatter(
    x=df['x'], 
    y=df['y'],
    mode='markers+lines',
    hovertemplate='<b>%{x}</b><br>Wert: %{y}<extra></extra>'
))

fig.update_layout(
    hovermode='x unified',
    dragmode='zoom'
)
```

### 4. Accessibility

```python
# Kontrast für Farbenblindheit
import seaborn as sns
sns.set_palette("colorblind")

# Große Schrift
plt.rcParams['font.size'] = 12
plt.rcParams['axes.titlesize'] = 16
plt.rcParams['axes.labelsize'] = 14
```

---

## 📊 VISUALISIERUNGS-MATRIX

| Datentyp | Best Chart | Library | Interaktiv? |
|----------|-----------|---------|-------------|
| Ranking (Top X) | Bar Chart | Chart.js / Matplotlib | Optional |
| Zeitreihen | Line Chart | Chart.js / Plotly | Ja |
| Verteilung | Histogram / Box Plot | Seaborn | Nein |
| Vergleich | Scatter Plot | Plotly | Ja |
| Anteil | Pie / Donut | Chart.js | Optional |
| Korrelation | Heatmap | Seaborn | Nein |
| Hierarchie | Treemap / Sunburst | Plotly | Ja |
| Netzwerk | Network Graph | D3.js / NetworkX | Ja |
| Geo | Map | Plotly / Leaflet | Ja |
| Mehrere Metriken | Radar Chart | Chart.js | Optional |

---

## 🚀 DEPLOYMENT

### Static HTML Export

```python
# Plotly zu HTML
fig.write_html('chart.html')

# Matplotlib zu PNG
plt.savefig('chart.png', dpi=300, bbox_inches='tight')

# Alle Charts in einem HTML
from jinja2 import Template
html_template = """
<!DOCTYPE html>
<html>
<head>
    <title>Wasserball Analytics</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
</head>
<body>
    <h1>Analytics Dashboard</h1>
    {{ chart1 }}
    {{ chart2 }}
</body>
</html>
"""
```

### Angular Integration

```typescript
// Route hinzufügen
{
  path: 'analytics',
  component: AnalyticsComponent
}
```

---

## ✅ ZUSAMMENFASSUNG

**Für Prototypen:** Python + Matplotlib/Seaborn  
**Für Web-App:** Angular + Chart.js  
**Für Präsentationen:** Jupyter Notebook + Plotly  
**Für Production:** Angular + Plotly.js  

**Nächster Schritt:** Starte mit dem Python Quickstart Script! 🎯

```bash
python3 scripts/analytics_quickstart.py
```

Danach kannst du die besten Charts in Angular integrieren.
