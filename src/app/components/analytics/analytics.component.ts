import { Component, OnInit, OnDestroy, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { map, startWith } from 'rxjs/operators';
import { Observable } from 'rxjs';
import {
    AnalyticsService, Entity, Streak, BiggestWin, Journeyman, TopScorer,
    LeagueCompetitiveness, TotalStats
} from '../../services/analytics/analytics.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { ThemeService } from '../../services/theme/theme.service';

@Component({
    selector: 'app-analytics',
    standalone: true,
    imports: [
        CommonModule,
        BaseChartDirective,
        MatCardModule,
        MatTabsModule,
        MatAutocompleteModule,
        MatInputModule,
        MatFormFieldModule,
        ReactiveFormsModule,
        MatIconModule,
        MatButtonToggleModule,
        MatProgressSpinnerModule,
        MatTooltipModule,
        MatChipsModule
    ],
    templateUrl: './analytics.component.html',
    styleUrls: ['./analytics.component.scss']
})
export class AnalyticsComponent implements OnInit, OnDestroy {
    private analyticsService = inject(AnalyticsService);
    private themeService = inject(ThemeService);
    private ngZone = inject(NgZone);

    // Loading States
    isLoading = true;
    isLoadingEntity = false;

    // Search Controls
    searchControl = new FormControl('');
    filteredOptions: Observable<Entity[]> | undefined;
    allEntities: Entity[] = [];
    selectedEntity: Entity | null = null;
    currentTabIndex = 0;

    // KPI Stats
    totalStats: TotalStats = { totalGames: 0, totalTeams: 0, totalGoals: 0, seasonsCount: 0 };
    animatedGames = 0;
    animatedTeams = 0;
    animatedGoals = 0;
    animatedSeasons = 0;
    private animationFrameIds: number[] = [];

    // Chart Types
    barChartType: ChartType = 'bar';
    lineChartType: ChartType = 'line';
    doughnutChartType: ChartType = 'doughnut';

    // --- Overview Charts ---
    topTeamsChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
    trendsChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
    homeAdvantageChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
    growthChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
    goalDistributionData: ChartConfiguration['data'] = { labels: [], datasets: [] };
    highestScoringGames: any[] = [];
    winningStreaks: Streak[] = [];

    // Chart Options
    topTeamsChartOptions: ChartConfiguration['options'] = {};
    trendsChartOptions: ChartConfiguration['options'] = {};
    growthChartOptions: ChartConfiguration['options'] = {};
    goalDistributionOptions: ChartConfiguration['options'] = {};
    doughnutOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
            legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true, pointStyle: 'circle' } }
        }
    };

    // --- Team Charts ---
    entityChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
    entityChartOptions: ChartConfiguration['options'] = {};
    entityChartTitle = '';
    teamForm: any[] = [];
    teamRivalsChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
    teamGoalsPerSeasonData: ChartConfiguration['data'] = { labels: [], datasets: [] };
    teamGoalsPerSeasonOptions: ChartConfiguration['options'] = {};
    teamBiggestWins: BiggestWin[] = [];
    homeAwayStats: any = null;
    cleanSheets = 0;
    scoringFailures = 0;
    teamFavorites: any = null;

    // --- League Charts ---
    leagueComparisonChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
    seasonalPatternChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
    tightestLeagues: LeagueCompetitiveness[] = [];
    selectedLeagueStats: any = null;

    // --- Player Data ---
    topScorers: any[] = [];
    journeymen: Journeyman[] = [];
    youngTalents: TopScorer[] = [];
    leaderboardType: 'legends' | 'young' | 'journeyman' = 'legends';
    playerEfficiencyData: ChartConfiguration['data'] = { labels: [], datasets: [] };
    careerPath: any[] = [];
    playerPersonalBest: any = null;

    async ngOnInit() {
        this.buildChartOptions();
        this.isLoading = true;

        try {
            await Promise.all([
                this.loadTotalStats(),
                this.loadTopTeams(),
                this.loadTrends(),
                this.loadHomeAdvantage(),
                this.loadRecords(),
                this.loadGrowth(),
                this.loadWinningStreaks(),
                this.loadGoalDistribution()
            ]);
        } finally {
            this.isLoading = false;
        }

        this.setupSearch();
    }

    ngOnDestroy() {
        this.animationFrameIds.forEach(id => cancelAnimationFrame(id));
    }

    // --- Chart Options Builder (Theme-aware) ---

    private buildChartOptions() {
        const gridColor = this.isDark() ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
        const tickColor = this.isDark() ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
        const tooltipBg = this.isDark() ? '#2d2d2d' : '#fff';
        const tooltipColor = this.isDark() ? '#fff' : '#333';

        const base = (indexAxis: 'x' | 'y', legend: boolean, yTitle?: string): ChartConfiguration['options'] => ({
            responsive: true,
            maintainAspectRatio: false,
            indexAxis,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: legend,
                    labels: { color: tickColor, usePointStyle: true, pointStyle: 'circle', padding: 16 }
                },
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleColor: tooltipColor,
                    bodyColor: tooltipColor,
                    borderColor: gridColor,
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    displayColors: true,
                    usePointStyle: true
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor, drawTicks: false },
                    ticks: { color: tickColor, padding: 8 },
                    border: { display: false }
                },
                y: {
                    grid: { color: gridColor, drawTicks: false },
                    ticks: { color: tickColor, padding: 8 },
                    border: { display: false },
                    title: yTitle ? { display: true, text: yTitle, color: tickColor, padding: 8 } : undefined
                }
            }
        });

        this.topTeamsChartOptions = base('y', false);
        this.trendsChartOptions = base('x', true, 'Tore pro Spiel');
        this.growthChartOptions = base('x', true, 'Anzahl Spiele');
        this.goalDistributionOptions = base('x', false, 'Anzahl Spiele');
        this.entityChartOptions = base('x', true);
        this.teamGoalsPerSeasonOptions = base('x', true, 'Tore');
    }

    private isDark(): boolean {
        return this.themeService.effectiveTheme() === 'dark';
    }

    // --- KPI Animation ---

    private animateValue(target: number, property: 'animatedGames' | 'animatedTeams' | 'animatedGoals' | 'animatedSeasons') {
        const duration = 1500;
        const startTime = performance.now();

        const step = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            this[property] = Math.round(target * eased);

            if (progress < 1) {
                const id = requestAnimationFrame((t) => this.ngZone.run(() => step(t)));
                this.animationFrameIds.push(id);
            }
        };

        this.ngZone.runOutsideAngular(() => {
            const id = requestAnimationFrame((t) => this.ngZone.run(() => step(t)));
            this.animationFrameIds.push(id);
        });
    }

    // --- Search ---

    setupSearch() {
        this.filteredOptions = this.searchControl.valueChanges.pipe(
            startWith(''),
            map(value => {
                const name = typeof value === 'string' ? value : (value as any)?.name;
                return name ? this._filter(name) : this.allEntities.slice(0, 50);
            }),
        );
    }

    private _filter(name: string): Entity[] {
        const filterValue = name.toLowerCase();
        return this.allEntities.filter(o => o.name.toLowerCase().includes(filterValue)).slice(0, 50);
    }

    displayFn(entity: Entity): string {
        return entity?.name ?? '';
    }

    async onTabChange(event: any) {
        this.currentTabIndex = event.index;
        this.selectedEntity = null;
        this.searchControl.setValue('');
        this.resetCharts();

        if (this.currentTabIndex === 1) {
            this.allEntities = await this.analyticsService.getAllTeams();
        } else if (this.currentTabIndex === 2) {
            this.allEntities = await this.analyticsService.getAllLeagues();
            this.loadLeagueComparisons();
        } else if (this.currentTabIndex === 3) {
            this.allEntities = await this.analyticsService.getAllPlayers();
            await this.loadLeaderboardData();
        }

        this.searchControl.setValue('');
    }

    resetCharts() {
        this.entityChartData = { labels: [], datasets: [] };
        this.teamForm = [];
        this.teamRivalsChartData = { labels: [], datasets: [] };
        this.teamGoalsPerSeasonData = { labels: [], datasets: [] };
        this.selectedLeagueStats = null;
        this.teamFavorites = null;
        this.playerPersonalBest = null;
        this.homeAwayStats = null;
        this.cleanSheets = 0;
        this.scoringFailures = 0;
        this.teamBiggestWins = [];
        this.careerPath = [];
    }

    async onOptionSelected(event: MatAutocompleteSelectedEvent) {
        const entity: Entity = event.option.value;
        this.selectedEntity = entity;
        this.isLoadingEntity = true;

        try {
            if (this.currentTabIndex === 1) {
                await this.loadTeamStats(entity.id);
            } else if (this.currentTabIndex === 2) {
                await this.loadLeagueStats(entity.id);
            } else if (this.currentTabIndex === 3) {
                await this.loadPlayerStats(entity.id);
            }
        } finally {
            this.isLoadingEntity = false;
        }
    }

    // --- Loading: Overview ---

    private async loadTotalStats() {
        this.totalStats = await this.analyticsService.getTotalStats();
        this.animateValue(this.totalStats.totalGames, 'animatedGames');
        this.animateValue(this.totalStats.totalTeams, 'animatedTeams');
        this.animateValue(this.totalStats.totalGoals, 'animatedGoals');
        this.animateValue(this.totalStats.seasonsCount, 'animatedSeasons');
    }

    private async loadTopTeams() {
        const teams = await this.analyticsService.getTopTeams(20);
        const colors = teams.map(t => {
            const v = t.winRate;
            if (v < 50) return `rgba(255, ${Math.round(5.1 * v)}, 0, 0.8)`;
            return `rgba(${Math.round(255 - 5.1 * (v - 50))}, 255, 0, 0.8)`;
        });

        this.topTeamsChartData = {
            labels: teams.map(t => t.name),
            datasets: [{
                data: teams.map(t => t.winRate),
                label: 'Siegquote (%)',
                backgroundColor: colors,
                borderRadius: 6,
                borderSkipped: false
            }]
        };
    }

    private async loadTrends() {
        const trends = await this.analyticsService.getTrendsOverTime();
        this.trendsChartData = {
            labels: trends.map(t => t.season_id),
            datasets: [{
                data: trends.map(t => t.avgGoals),
                label: 'Ø Tore pro Spiel',
                fill: true,
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: 'rgba(59, 130, 246, 1)'
            }]
        };
    }

    private async loadHomeAdvantage() {
        const stats = await this.analyticsService.getHomeAdvantage();
        const order = ['Heimsieg', 'Auswärtssieg', 'Unentschieden'];
        const sorted = order.map(label => stats.find(s => s.result === label) || { result: label, count: 0 });
        const total = sorted.reduce((acc, curr) => acc + curr.count, 0);

        this.homeAdvantageChartData = {
            labels: sorted.map(s => `${s.result} (${Math.round(s.count / total * 100)}%)`),
            datasets: [{
                data: sorted.map(s => s.count),
                backgroundColor: ['rgba(34, 197, 94, 0.85)', 'rgba(59, 130, 246, 0.85)', 'rgba(156, 163, 175, 0.7)'],
                hoverBackgroundColor: ['rgba(34, 197, 94, 1)', 'rgba(59, 130, 246, 1)', 'rgba(156, 163, 175, 1)'],
                borderWidth: 0,
                hoverOffset: 8
            }]
        };
    }

    private async loadRecords() {
        this.highestScoringGames = await this.analyticsService.getHighestScoringGames(5);
    }

    private async loadGrowth() {
        const growth = await this.analyticsService.getSeasonGrowth();
        this.growthChartData = {
            labels: growth.map(g => g.season),
            datasets: [{
                data: growth.map(g => g.games),
                label: 'Spiele',
                borderColor: 'rgba(139, 92, 246, 1)',
                backgroundColor: 'rgba(139, 92, 246, 0.15)',
                fill: true,
                tension: 0.4,
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: 'rgba(139, 92, 246, 1)'
            }]
        };
    }

    private async loadWinningStreaks() {
        this.winningStreaks = await this.analyticsService.getWinningStreaks(5);
    }

    private async loadGoalDistribution() {
        const dist = await this.analyticsService.getGoalDistribution();
        const colors = [
            'rgba(59, 130, 246, 0.7)', 'rgba(34, 197, 94, 0.7)', 'rgba(245, 158, 11, 0.7)',
            'rgba(239, 68, 68, 0.7)', 'rgba(139, 92, 246, 0.7)', 'rgba(236, 72, 153, 0.7)',
            'rgba(20, 184, 166, 0.7)'
        ];
        this.goalDistributionData = {
            labels: dist.map(d => d.bucket),
            datasets: [{
                data: dist.map(d => d.count),
                label: 'Spiele',
                backgroundColor: dist.map((_, i) => colors[i % colors.length]),
                borderRadius: 6,
                borderSkipped: false
            }]
        };
    }

    // --- Loading: Team ---

    private async loadTeamStats(teamId: string) {
        const [stats, form, rivals, od, biggestWins, homeAway, sheets, failures, favorites, goalsPerSeason] =
            await Promise.all([
                this.analyticsService.getTeamStatsHistory(teamId),
                this.analyticsService.getTeamForm(teamId),
                this.analyticsService.getTeamRivals(teamId),
                this.analyticsService.getTeamOffenseDefense(teamId),
                this.analyticsService.getTeamBiggestWins(teamId),
                this.analyticsService.getTeamHomeAwayStats(teamId),
                this.analyticsService.getTeamCleanSheets(teamId),
                this.analyticsService.getTeamScoringFailures(teamId),
                this.analyticsService.getTeamFavoriteOpponents(teamId),
                this.analyticsService.getTeamGoalsPerSeason(teamId)
            ]);

        this.entityChartData = {
            labels: stats.map(s => s.season),
            datasets: [{
                data: stats.map(s => s.winRate),
                label: 'Siegquote (%)',
                borderColor: 'rgba(59, 130, 246, 1)',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                fill: true, tension: 0.4, borderWidth: 2,
                pointRadius: 4, pointHoverRadius: 7,
                pointBackgroundColor: 'rgba(59, 130, 246, 1)'
            }]
        };

        this.teamForm = form;

        this.teamRivalsChartData = {
            labels: rivals.map(r => r.opponent),
            datasets: [
                { data: rivals.map(r => r.wins), label: 'Siege', backgroundColor: 'rgba(34, 197, 94, 0.7)', borderRadius: 4, borderSkipped: false },
                { data: rivals.map(r => r.draws), label: 'Remis', backgroundColor: 'rgba(156, 163, 175, 0.5)', borderRadius: 4, borderSkipped: false },
                { data: rivals.map(r => r.losses), label: 'Niederlagen', backgroundColor: 'rgba(239, 68, 68, 0.7)', borderRadius: 4, borderSkipped: false }
            ]
        };

        this.teamGoalsPerSeasonData = {
            labels: goalsPerSeason.map(g => g.season),
            datasets: [
                {
                    data: goalsPerSeason.map(g => g.scored), label: 'Erzielte Tore',
                    borderColor: 'rgba(34, 197, 94, 1)', backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    fill: true, tension: 0.4, borderWidth: 2, pointRadius: 4, pointHoverRadius: 7,
                    pointBackgroundColor: 'rgba(34, 197, 94, 1)'
                },
                {
                    data: goalsPerSeason.map(g => g.conceded), label: 'Kassierte Tore',
                    borderColor: 'rgba(239, 68, 68, 1)', backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true, tension: 0.4, borderWidth: 2, pointRadius: 4, pointHoverRadius: 7,
                    pointBackgroundColor: 'rgba(239, 68, 68, 1)'
                }
            ]
        };

        this.teamBiggestWins = biggestWins;
        this.homeAwayStats = homeAway;
        this.cleanSheets = sheets;
        this.scoringFailures = failures;
        this.teamFavorites = favorites;
    }

    // --- Loading: Player ---

    private async loadPlayerStats(playerId: string) {
        const [stats, effic, career, personalBest] = await Promise.all([
            this.analyticsService.getPlayerStatsHistory(playerId),
            this.analyticsService.getPlayerEfficiency(playerId),
            this.analyticsService.getPlayerTeams(playerId),
            this.analyticsService.getPlayerFavoriteOpponent(playerId)
        ]);

        this.entityChartTitle = 'Tore pro Saison';
        this.entityChartData = {
            labels: stats.map(s => s.season),
            datasets: [{
                data: stats.map(s => s.goals), label: 'Tore',
                backgroundColor: 'rgba(245, 158, 11, 0.7)', borderColor: 'rgba(245, 158, 11, 1)',
                borderWidth: 1, borderRadius: 6, borderSkipped: false
            }]
        };

        this.playerEfficiencyData = {
            labels: effic.map(e => e.season),
            datasets: [{
                data: effic.map(e => e.avg), label: 'Ø Tore pro Spiel',
                borderColor: 'rgba(245, 158, 11, 1)', backgroundColor: 'rgba(245, 158, 11, 0.15)',
                tension: 0.4, fill: true, borderWidth: 2, pointRadius: 4, pointHoverRadius: 7,
                pointBackgroundColor: 'rgba(245, 158, 11, 1)'
            }]
        };

        this.careerPath = career;
        this.playerPersonalBest = personalBest;
    }

    // --- Loading: League ---

    private async loadLeagueStats(leagueId: string) {
        this.selectedLeagueStats = await this.analyticsService.getLeagueDetails(leagueId);
    }

    private async loadLeagueComparisons() {
        const [comp, seasonal] = await Promise.all([
            this.analyticsService.getLeagueComparison(),
            this.analyticsService.getSeasonalPatterns()
        ]);

        const gradientColors = [
            'rgba(239, 68, 68, 0.7)', 'rgba(59, 130, 246, 0.7)', 'rgba(245, 158, 11, 0.7)',
            'rgba(34, 197, 94, 0.7)', 'rgba(139, 92, 246, 0.7)', 'rgba(236, 72, 153, 0.7)'
        ];

        this.leagueComparisonChartData = {
            labels: comp.map(c => c.level),
            datasets: [{
                data: comp.map(c => c.avgGoals), label: 'Ø Tore pro Spiel',
                backgroundColor: gradientColors.slice(0, comp.length),
                borderRadius: 6, borderSkipped: false
            }]
        };

        const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
        const dataPoints = Array.from({ length: 12 }, (_, i) => {
            const m = seasonal.find(s => s.month === i + 1);
            return m ? m.avgGoals : 0;
        });

        this.seasonalPatternChartData = {
            labels: monthNames,
            datasets: [{
                data: dataPoints, label: 'Ø Tore pro Spiel',
                borderColor: 'rgba(245, 158, 11, 1)', backgroundColor: 'rgba(245, 158, 11, 0.15)',
                fill: true, tension: 0.4, borderWidth: 2, pointRadius: 4, pointHoverRadius: 7,
                pointBackgroundColor: 'rgba(245, 158, 11, 1)'
            }]
        };

        this.tightestLeagues = await this.analyticsService.getClutchPlayers(10);
    }

    // --- Loading: Leaderboard ---

    async loadLeaderboardData() {
        const [scorers, journeymen, young] = await Promise.all([
            this.analyticsService.getTopScorersAllTime(20),
            this.analyticsService.getPlayerJourneymen(10),
            this.analyticsService.getYoungTalents(10)
        ]);
        this.topScorers = scorers;
        this.journeymen = journeymen;
        this.youngTalents = young;
    }

    setLeaderboardType(type: 'legends' | 'young' | 'journeyman') {
        this.leaderboardType = type;
    }

    // --- Helpers ---

    getRankBadge(index: number): string {
        return index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}`;
    }

    getRankClass(index: number): string {
        return index < 3 ? ['gold', 'silver', 'bronze'][index] : '';
    }

    getFormIcon(result: string): string {
        return result === 'W' ? '✓' : result === 'L' ? '✗' : '—';
    }

    getHomeWinRate(): number {
        if (!this.homeAwayStats) return 0;
        const t = this.homeAwayStats.home.w + this.homeAwayStats.home.d + this.homeAwayStats.home.l;
        return t > 0 ? Math.round(100 * this.homeAwayStats.home.w / t) : 0;
    }

    getAwayWinRate(): number {
        if (!this.homeAwayStats) return 0;
        const t = this.homeAwayStats.away.w + this.homeAwayStats.away.d + this.homeAwayStats.away.l;
        return t > 0 ? Math.round(100 * this.homeAwayStats.away.w / t) : 0;
    }
}
