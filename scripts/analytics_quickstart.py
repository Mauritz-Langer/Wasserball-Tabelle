#!/usr/bin/env python3
"""
Wasserball Analytics - Quick Start
==================================
Einfache Analysen und Visualisierungen zum Einstieg
"""

import sqlite3
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path

# Konfiguration
DB_PATH = Path(__file__).parent.parent / 'src/assets/data/seasons.db'
OUTPUT_DIR = Path(__file__).parent.parent / 'analysis_output'
OUTPUT_DIR.mkdir(exist_ok=True)

# Style
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (12, 6)
plt.rcParams['font.size'] = 10

def get_connection():
    """Datenbankverbindung herstellen"""
    return sqlite3.connect(DB_PATH)

# ============================================================================
# 1. TOP TEAMS ANALYSE
# ============================================================================

def analyze_top_teams():
    """Top 20 Teams nach Siegquote"""
    print("\n📊 TOP TEAMS ANALYSE")
    print("=" * 80)

    query = """
    SELECT
        t.name,
        COUNT(DISTINCT g.id) as total_games,
        SUM(CASE
            WHEN (g.home_team_id = t.id AND g.home_score > g.guest_score)
              OR (g.guest_team_id = t.id AND g.guest_score > g.home_score)
            THEN 1 ELSE 0
        END) as wins,
        ROUND(100.0 * SUM(CASE
            WHEN (g.home_team_id = t.id AND g.home_score > g.guest_score)
              OR (g.guest_team_id = t.id AND g.guest_score > g.home_score)
            THEN 1 ELSE 0
        END) / COUNT(DISTINCT g.id), 2) as win_rate,
        ROUND(AVG(CASE
            WHEN g.home_team_id = t.id THEN g.home_score
            ELSE g.guest_score
        END), 2) as avg_goals_scored,
        ROUND(AVG(CASE
            WHEN g.home_team_id = t.id THEN g.guest_score
            ELSE g.home_score
        END), 2) as avg_goals_conceded
    FROM teams t
    JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
    WHERE g.home_score IS NOT NULL
    GROUP BY t.id
    HAVING total_games >= 20
    ORDER BY win_rate DESC
    LIMIT 20
    """

    df = pd.read_sql_query(query, get_connection())

    print(df.to_string(index=False))

    # Visualisierung
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

    # Win Rate
    ax1.barh(df['name'], df['win_rate'], color='steelblue')
    ax1.set_xlabel('Siegquote (%)')
    ax1.set_title('Top 20 Teams - Siegquote')
    ax1.invert_yaxis()

    # Tore
    x = range(len(df))
    width = 0.35
    ax2.barh([i - width/2 for i in x], df['avg_goals_scored'], width, label='Geschossen', color='green', alpha=0.7)
    ax2.barh([i + width/2 for i in x], df['avg_goals_conceded'], width, label='Kassiert', color='red', alpha=0.7)
    ax2.set_yticks(x)
    ax2.set_yticklabels(df['name'])
    ax2.set_xlabel('Durchschnittliche Tore')
    ax2.set_title('Top 20 Teams - Tordurchschnitt')
    ax2.legend()
    ax2.invert_yaxis()

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'top_teams.png', dpi=300, bbox_inches='tight')
    print(f"\n✅ Gespeichert: {OUTPUT_DIR / 'top_teams.png'}")
    plt.close()

    return df

# ============================================================================
# 2. TOP SCORER ANALYSE
# ============================================================================

def analyze_top_scorers():
    """Top 50 Torschützen aller Zeiten"""
    print("\n⚽ TOP SCORER ANALYSE")
    print("=" * 80)

    query = """
    SELECT
        p.name,
        p.birth_year,
        2026 - p.birth_year as age,
        SUM(s.goals) as career_goals,
        SUM(s.games) as career_games,
        ROUND(1.0 * SUM(s.goals) / NULLIF(SUM(s.games), 0), 2) as goals_per_game,
        COUNT(DISTINCT s.league_id) as leagues_played,
        MIN(CAST(SUBSTR(s.league_id, 1, 4) AS INTEGER)) as first_season,
        MAX(CAST(SUBSTR(s.league_id, 1, 4) AS INTEGER)) as last_season
    FROM players p
    JOIN scorers s ON s.player_id = p.id
    GROUP BY p.id
    HAVING career_games >= 10
    ORDER BY career_goals DESC
    LIMIT 50
    """

    df = pd.read_sql_query(query, get_connection())

    print(df.head(20).to_string(index=False))

    # Visualisierung
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

    # Top 20 Scorer
    top20 = df.head(20)
    ax1.barh(top20['name'], top20['career_goals'], color='darkgreen')
    ax1.set_xlabel('Karriere-Tore')
    ax1.set_title('Top 20 Torschützen aller Zeiten')
    ax1.invert_yaxis()

    # Goals per Game vs. Total Goals
    ax2.scatter(df['career_goals'], df['goals_per_game'], alpha=0.6, s=100)
    ax2.set_xlabel('Karriere-Tore')
    ax2.set_ylabel('Tore pro Spiel')
    ax2.set_title('Effizienz vs. Gesamtleistung')
    ax2.grid(True, alpha=0.3)

    # Annotate Top 5
    for idx, row in df.head(5).iterrows():
        ax2.annotate(row['name'], (row['career_goals'], row['goals_per_game']),
                    xytext=(5, 5), textcoords='offset points', fontsize=8)

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'top_scorers.png', dpi=300, bbox_inches='tight')
    print(f"\n✅ Gespeichert: {OUTPUT_DIR / 'top_scorers.png'}")
    plt.close()

    return df

# ============================================================================
# 3. ZEITREIHEN-ANALYSE
# ============================================================================

def analyze_trends_over_time():
    """Entwicklung über Saisons"""
    print("\n📈 ZEITREIHEN-ANALYSE")
    print("=" * 80)

    query = """
    SELECT
        l.season_id,
        COUNT(DISTINCT g.id) as games,
        ROUND(AVG(g.total_goals), 2) as avg_goals,
        MAX(g.total_goals) as max_goals,
        COUNT(DISTINCT t.id) as unique_teams
    FROM leagues l
    JOIN games g ON g.league_id = l.id
    LEFT JOIN teams t ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
    WHERE g.total_goals IS NOT NULL
    GROUP BY l.season_id
    ORDER BY l.season_id
    """

    df = pd.read_sql_query(query, get_connection())
    df['season_id'] = df['season_id'].astype(int)

    print(df.to_string(index=False))

    # Visualisierung
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))

    # Anzahl Spiele
    axes[0, 0].plot(df['season_id'], df['games'], marker='o', linewidth=2, color='steelblue')
    axes[0, 0].set_xlabel('Saison')
    axes[0, 0].set_ylabel('Anzahl Spiele')
    axes[0, 0].set_title('Entwicklung der Spielanzahl')
    axes[0, 0].grid(True, alpha=0.3)

    # Durchschnittliche Tore
    axes[0, 1].plot(df['season_id'], df['avg_goals'], marker='o', linewidth=2, color='green')
    axes[0, 1].set_xlabel('Saison')
    axes[0, 1].set_ylabel('Durchschnittliche Tore pro Spiel')
    axes[0, 1].set_title('Tor-Entwicklung über Zeit')
    axes[0, 1].grid(True, alpha=0.3)

    # Maximale Tore
    axes[1, 0].bar(df['season_id'], df['max_goals'], color='orange', alpha=0.7)
    axes[1, 0].set_xlabel('Saison')
    axes[1, 0].set_ylabel('Höchstes Spielergebnis')
    axes[1, 0].set_title('Torreichstes Spiel pro Saison')
    axes[1, 0].grid(True, alpha=0.3, axis='y')

    # Unique Teams
    axes[1, 1].plot(df['season_id'], df['unique_teams'], marker='s', linewidth=2, color='purple')
    axes[1, 1].set_xlabel('Saison')
    axes[1, 1].set_ylabel('Anzahl verschiedener Teams')
    axes[1, 1].set_title('Teilnehmende Teams')
    axes[1, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'trends_over_time.png', dpi=300, bbox_inches='tight')
    print(f"\n✅ Gespeichert: {OUTPUT_DIR / 'trends_over_time.png'}")
    plt.close()

    return df

# ============================================================================
# 4. SAISONALE MUSTER
# ============================================================================

def analyze_seasonal_patterns():
    """Spiele nach Monat und Wochentag"""
    print("\n📅 SAISONALE MUSTER")
    print("=" * 80)

    # Monat
    query_month = """
    SELECT
        start_month,
        start_month_name,
        COUNT(*) as games,
        ROUND(AVG(total_goals), 2) as avg_goals
    FROM games
    WHERE start_month IS NOT NULL AND total_goals IS NOT NULL
    GROUP BY start_month, start_month_name
    ORDER BY start_month
    """

    df_month = pd.read_sql_query(query_month, get_connection())

    # Wochentag
    query_day = """
    SELECT
        CASE start_day_of_week
            WHEN 'Montag' THEN 1
            WHEN 'Dienstag' THEN 2
            WHEN 'Mittwoch' THEN 3
            WHEN 'Donnerstag' THEN 4
            WHEN 'Freitag' THEN 5
            WHEN 'Samstag' THEN 6
            WHEN 'Sonntag' THEN 7
        END as day_num,
        start_day_of_week as day_name,
        COUNT(*) as games,
        ROUND(AVG(total_goals), 2) as avg_goals
    FROM games
    WHERE start_day_of_week IS NOT NULL AND total_goals IS NOT NULL
    GROUP BY start_day_of_week
    ORDER BY day_num
    """

    df_day = pd.read_sql_query(query_day, get_connection())

    print("\nSpiele pro Monat:")
    print(df_month.to_string(index=False))
    print("\nSpiele pro Wochentag:")
    print(df_day.to_string(index=False))

    # Visualisierung
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

    # Monat
    ax1.bar(df_month['start_month_name'], df_month['games'], color='steelblue', alpha=0.7)
    ax1.set_xlabel('Monat')
    ax1.set_ylabel('Anzahl Spiele')
    ax1.set_title('Spiele pro Monat')
    ax1.tick_params(axis='x', rotation=45)
    ax1.grid(True, alpha=0.3, axis='y')

    # Wochentag
    colors = ['red' if day in ['Samstag', 'Sonntag'] else 'steelblue' for day in df_day['day_name']]
    ax2.bar(df_day['day_name'], df_day['games'], color=colors, alpha=0.7)
    ax2.set_xlabel('Wochentag')
    ax2.set_ylabel('Anzahl Spiele')
    ax2.set_title('Spiele pro Wochentag')
    ax2.tick_params(axis='x', rotation=45)
    ax2.grid(True, alpha=0.3, axis='y')

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'seasonal_patterns.png', dpi=300, bbox_inches='tight')
    print(f"\n✅ Gespeichert: {OUTPUT_DIR / 'seasonal_patterns.png'}")
    plt.close()

    return df_month, df_day

# ============================================================================
# 5. HEIMVORTEIL-ANALYSE
# ============================================================================

def analyze_home_advantage():
    """Heimvorteil über alle Spiele"""
    print("\n🏠 HEIMVORTEIL-ANALYSE")
    print("=" * 80)

    query = """
    SELECT
        AVG(home_score - guest_score) as avg_home_advantage,
        SUM(CASE WHEN home_score > guest_score THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as home_win_percentage,
        SUM(CASE WHEN home_score = guest_score THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as draw_percentage,
        SUM(CASE WHEN home_score < guest_score THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as away_win_percentage,
        COUNT(*) as total_games
    FROM games
    WHERE home_score IS NOT NULL
    """

    result = pd.read_sql_query(query, get_connection())

    print(f"\nDurchschnittlicher Heimvorteil: {result['avg_home_advantage'].iloc[0]:.2f} Tore")
    print(f"Heimsiege: {result['home_win_percentage'].iloc[0]:.1f}%")
    print(f"Unentschieden: {result['draw_percentage'].iloc[0]:.1f}%")
    print(f"Auswärtssiege: {result['away_win_percentage'].iloc[0]:.1f}%")

    # Visualisierung
    fig, ax = plt.subplots(figsize=(8, 6))

    sizes = [result['home_win_percentage'].iloc[0],
             result['draw_percentage'].iloc[0],
             result['away_win_percentage'].iloc[0]]
    labels = ['Heimsiege', 'Unentschieden', 'Auswärtssiege']
    colors = ['green', 'gray', 'red']

    ax.pie(sizes, labels=labels, colors=colors, autopct='%1.1f%%', startangle=90)
    ax.set_title('Verteilung der Spielausgänge')

    plt.savefig(OUTPUT_DIR / 'home_advantage.png', dpi=300, bbox_inches='tight')
    print(f"\n✅ Gespeichert: {OUTPUT_DIR / 'home_advantage.png'}")
    plt.close()

    return result

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Führt alle Analysen aus"""
    print("\n" + "="*80)
    print("🏊 WASSERBALL ANALYTICS - QUICK START")
    print("="*80)

    try:
        # Analysen durchführen
        analyze_top_teams()
        analyze_top_scorers()
        analyze_trends_over_time()
        analyze_seasonal_patterns()
        analyze_home_advantage()

        print("\n" + "="*80)
        print("✅ ALLE ANALYSEN ABGESCHLOSSEN")
        print("="*80)
        print(f"\nOutput-Verzeichnis: {OUTPUT_DIR}")
        print("\nErstellt Dateien:")
        for file in OUTPUT_DIR.glob('*.png'):
            print(f"  • {file.name}")

    except Exception as e:
        print(f"\n❌ Fehler: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
