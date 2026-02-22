#!/bin/bash

# ============================================================================
# Database Optimization - Complete Workflow
# ============================================================================
# Führt alle Optimierungsschritte in der richtigen Reihenfolge aus
# ============================================================================

set -e  # Exit on error

echo "🏊 Wasserball-Tabelle Database Optimization"
echo "============================================================================"
echo ""

DB_PATH="src/assets/data/seasons.db"
BACKUP_PATH="src/assets/data/seasons.db.backup.$(date +%Y%m%d_%H%M%S)"

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Prüfe ob DB existiert
if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}❌ Database not found: $DB_PATH${NC}"
    exit 1
fi

echo -e "${BLUE}📊 Current Database Size:${NC}"
ls -lh "$DB_PATH" | awk '{print "   " $5}'
echo ""

# ============================================================================
# SCHRITT 1: BACKUP
# ============================================================================

echo -e "${YELLOW}📦 Step 1/5: Creating Backup...${NC}"
cp "$DB_PATH" "$BACKUP_PATH"
echo -e "${GREEN}✅ Backup created: $BACKUP_PATH${NC}"
echo ""

# ============================================================================
# SCHRITT 2: INDIZES HINZUFÜGEN
# ============================================================================

echo -e "${YELLOW}🔧 Step 2/5: Adding Indexes...${NC}"
if sqlite3 "$DB_PATH" < scripts/add-indexes.sql; then
    echo -e "${GREEN}✅ Indexes added successfully${NC}"
else
    echo -e "${RED}❌ Failed to add indexes${NC}"
    exit 1
fi
echo ""

# ============================================================================
# SCHRITT 3: DATEN BEREINIGEN
# ============================================================================

echo -e "${YELLOW}🧹 Step 3/5: Cleaning Data...${NC}"
if sqlite3 "$DB_PATH" < scripts/cleanup-data.sql; then
    echo -e "${GREEN}✅ Data cleaned successfully${NC}"
else
    echo -e "${RED}❌ Failed to clean data${NC}"
    exit 1
fi
echo ""

# ============================================================================
# SCHRITT 4: ANALYSE
# ============================================================================

echo -e "${YELLOW}📊 Step 4/5: Running Analysis...${NC}"
sqlite3 "$DB_PATH" << 'EOF'
.mode column
.headers on

SELECT 'Database Statistics' as '';
SELECT
    'Total Indexes' as Metric,
    COUNT(*) as Value
FROM sqlite_master
WHERE type='index' AND name NOT LIKE 'sqlite_%'
UNION ALL
SELECT 'Total Tables', COUNT(*) FROM sqlite_master WHERE type='table'
UNION ALL
SELECT 'Total Games', COUNT(*) FROM games
UNION ALL
SELECT 'Games with Details', COUNT(*) FROM games WHERE is_details_processed = 1;

SELECT '';
SELECT 'Index List' as '';
SELECT name, tbl_name as table_name
FROM sqlite_master
WHERE type='index' AND name NOT LIKE 'sqlite_%'
ORDER BY tbl_name, name
LIMIT 20;
EOF
echo ""

# ============================================================================
# SCHRITT 5: PERFORMANCE TEST
# ============================================================================

echo -e "${YELLOW}⚡ Step 5/5: Performance Test...${NC}"
echo "Running sample queries..."

# Test Query 1: Liga-Spiele laden
echo -n "   Query 1 (Load league games): "
TIME1=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM games WHERE league_id = '2025_196'" | tail -1)
echo -e "${GREEN}✓${NC} ($TIME1 rows)"

# Test Query 2: Torschützen nach Liga
echo -n "   Query 2 (Top scorers): "
TIME2=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM scorers WHERE league_id = '2025_196' ORDER BY goals DESC LIMIT 10" | tail -1)
echo -e "${GREEN}✓${NC} ($TIME2 rows)"

# Test Query 3: JOIN mit Details
echo -n "   Query 3 (Game with events): "
TIME3=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM games g INNER JOIN game_events e ON g.id = e.game_id" | tail -1)
echo -e "${GREEN}✓${NC} ($TIME3 rows)"

echo ""

# ============================================================================
# ZUSAMMENFASSUNG
# ============================================================================

echo -e "${BLUE}📊 Optimization Summary:${NC}"
echo ""
echo "   Before:"
echo "   └─ Size: $(ls -lh "$BACKUP_PATH" | awk '{print $5}')"
echo ""
echo "   After:"
NEW_SIZE=$(ls -lh "$DB_PATH" | awk '{print $5}')
echo "   └─ Size: $NEW_SIZE"
echo ""

# Größenvergleich
OLD_BYTES=$(stat -f%z "$BACKUP_PATH" 2>/dev/null || stat -c%s "$BACKUP_PATH" 2>/dev/null)
NEW_BYTES=$(stat -f%z "$DB_PATH" 2>/dev/null || stat -c%s "$DB_PATH" 2>/dev/null)
SAVED=$((OLD_BYTES - NEW_BYTES))
PERCENT=$(echo "scale=1; ($SAVED * 100) / $OLD_BYTES" | bc)

if [ $SAVED -gt 0 ]; then
    echo -e "${GREEN}   💾 Saved: $(echo $SAVED | awk '{print $1/1024/1024 " MB"}') (${PERCENT}%)${NC}"
elif [ $SAVED -lt 0 ]; then
    echo -e "${YELLOW}   ⚠️  Size increased by: $(echo ${SAVED#-} | awk '{print $1/1024/1024 " MB"}')${NC}"
    echo -e "${YELLOW}   (This is normal after adding indexes)${NC}"
else
    echo "   ℹ️  Size unchanged"
fi

echo ""
echo -e "${GREEN}✅ Optimization Complete!${NC}"
echo ""
echo "Next steps:"
echo "   1. Test the application: npm run dev"
echo "   2. Check query performance in browser DevTools"
echo "   3. If everything works, delete old backup: rm $BACKUP_PATH"
echo "   4. Consider team normalization: node scripts/migrate-teams.js"
echo ""
echo "Backup location: $BACKUP_PATH"
echo "============================================================================"
