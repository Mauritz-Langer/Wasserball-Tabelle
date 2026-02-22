#!/usr/bin/env python3
import sqlite3
import json
from collections import defaultdict

DB_PATH = '../src/assets/data/seasons.db'

def analyze_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print("=" * 80)
    print("DATABASE ANALYSIS - seasons.db")
    print("=" * 80)

    # Table counts
    print("\n📊 TABLE COUNTS:")
    print("-" * 80)
    tables = ['seasons', 'leagues', 'games', 'table_entries', 'scorers',
              'game_events', 'game_quarter_scores', 'game_officials',
              'game_lineups', 'game_team_details']

    for table in tables:
        cursor.execute(f"SELECT COUNT(*) as count FROM {table}")
        count = cursor.fetchone()[0]
        print(f"  {table:25} {count:>10,}")

    # Database size
    cursor.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
    db_size = cursor.fetchone()[0]
    print(f"\n💾 Database Size: {db_size / (1024*1024):.1f} MB")

    # Data quality checks
    print("\n🔍 DATA QUALITY CHECKS:")
    print("-" * 80)

    # Games without results
    cursor.execute("SELECT COUNT(*) FROM games WHERE result IS NULL OR result = '' OR result = ' - '")
    no_result = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM games")
    total_games = cursor.fetchone()[0]
    print(f"  Games without result: {no_result:,} / {total_games:,} ({no_result/total_games*100:.1f}%)")

    # Games with details processed
    cursor.execute("SELECT COUNT(*) FROM games WHERE is_details_processed = 1")
    processed = cursor.fetchone()[0]
    print(f"  Games with details: {processed:,} / {total_games:,} ({processed/total_games*100:.1f}%)")

    # Games with events
    cursor.execute("SELECT COUNT(DISTINCT game_id) FROM game_events")
    games_with_events = cursor.fetchone()[0]
    print(f"  Games with events: {games_with_events:,} / {total_games:,} ({games_with_events/total_games*100:.1f}%)")

    # Duplicate checks
    cursor.execute("""
        SELECT COUNT(*) - COUNT(DISTINCT id) as dups FROM games
    """)
    dups = cursor.fetchone()[0]
    print(f"  Duplicate game IDs: {dups}")

    # Sample data
    print("\n📋 SAMPLE DATA:")
    print("-" * 80)

    print("\n  Season:")
    cursor.execute("SELECT * FROM seasons ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    if row:
        print(f"    {dict(row)}")

    print("\n  League:")
    cursor.execute("SELECT * FROM leagues ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    if row:
        for key in row.keys():
            print(f"    {key:20} {row[key]}")

    print("\n  Game:")
    cursor.execute("SELECT * FROM games WHERE result != ' - ' AND result IS NOT NULL LIMIT 1")
    row = cursor.fetchone()
    if row:
        for key in row.keys():
            val = row[key]
            if val is not None and len(str(val)) > 50:
                val = str(val)[:50] + "..."
            print(f"    {key:20} {val}")

    print("\n  Scorer:")
    cursor.execute("SELECT * FROM scorers ORDER BY goals DESC LIMIT 1")
    row = cursor.fetchone()
    if row:
        print(f"    {dict(row)}")

    # Distribution analysis
    print("\n📈 DISTRIBUTION ANALYSIS:")
    print("-" * 80)

    # Games per season
    print("\n  Games per Season:")
    cursor.execute("""
        SELECT s.id, s.name, COUNT(g.id) as game_count
        FROM seasons s
        LEFT JOIN leagues l ON l.season_id = s.id
        LEFT JOIN games g ON g.league_id = l.id
        GROUP BY s.id
        ORDER BY s.id DESC
    """)
    for row in cursor.fetchall():
        print(f"    {row[1]:15} {row[2]:>6,} games")

    # Top scorers
    print("\n  Top 5 Scorers:")
    cursor.execute("SELECT name, team, goals, games FROM scorers ORDER BY goals DESC LIMIT 5")
    for row in cursor.fetchall():
        print(f"    {row[0]:25} {row[1]:20} {row[2]:3} goals in {row[3]:3} games")

    # Schema information
    print("\n🗂️  SCHEMA DETAILS:")
    print("-" * 80)

    # Games table columns
    print("\n  Games Table Columns:")
    cursor.execute("PRAGMA table_info(games)")
    for row in cursor.fetchall():
        print(f"    {row[1]:25} {row[2]:10}")

    # Indexes
    print("\n  Indexes:")
    cursor.execute("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
    indexes = cursor.fetchall()
    if indexes:
        for row in indexes:
            print(f"    {row[0]:30} on {row[1]}")
    else:
        print("    ⚠️  No custom indexes found!")

    # Performance issues
    print("\n⚠️  POTENTIAL ISSUES:")
    print("-" * 80)

    issues = []

    # Missing indexes
    if not indexes:
        issues.append("No indexes defined - queries will be slow")

    # Large text fields
    cursor.execute("SELECT AVG(LENGTH(notes)) as avg_len FROM games WHERE notes IS NOT NULL")
    avg_notes = cursor.fetchone()[0]
    if avg_notes and avg_notes > 1000:
        issues.append(f"Large notes field (avg {avg_notes:.0f} chars) - consider compression")

    # High redundancy
    cursor.execute("""
        SELECT home_team, COUNT(*) as cnt
        FROM games
        GROUP BY home_team
        ORDER BY cnt DESC
        LIMIT 1
    """)
    top_team = cursor.fetchone()
    if top_team:
        issues.append(f"Team names stored as text ({top_team[1]:,} occurrences of '{top_team[0]}') - consider normalization")

    # Unprocessed games
    if processed < total_games * 0.5:
        issues.append(f"Only {processed/total_games*100:.1f}% of games have detailed data")

    if issues:
        for i, issue in enumerate(issues, 1):
            print(f"  {i}. {issue}")
    else:
        print("  ✅ No major issues detected")

    conn.close()

    print("\n" + "=" * 80)

if __name__ == '__main__':
    analyze_db()
