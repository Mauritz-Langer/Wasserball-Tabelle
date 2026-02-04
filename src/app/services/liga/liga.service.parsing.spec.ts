import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { LigaService } from './liga.service';

describe('LigaService Parsing', () => {
    let service: LigaService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [LigaService]
        });
        service = TestBed.inject(LigaService);
    });

    describe('parseHtmlToScorer with Birth Year', () => {
        it('sollte Jahrgang parsen wenn 6 Spalten vorhanden sind', () => {
            const html = `
        <div id="scorer">
          <table>
            <tr>
              <td>1</td>
              <td>Spieler Name</td>
              <td>Team Name</td>
              <td>2005</td> <!-- Jahrgang -->
              <td>25</td>   <!-- Tore -->
              <td>10</td>   <!-- Spiele -->
            </tr>
          </table>
        </div>
      `;
            // Mock DOMParser if needed or rely on browser environment (Angular tests usually run in browser-like env)
            const result = service.parseHtmlToScorer(html);

            expect(result.length).toBe(1);
            expect(result[0].name).toBe('Spieler Name');
            expect(result[0].birthYear).toBe('2005');
            expect(result[0].goals).toBe(25);
            expect(result[0].games).toBe(10);
        });

        it('sollte leeren Jahrgang zurückgeben wenn nur 5 Spalten vorhanden sind (alte Struktur)', () => {
            const html = `
        <div id="scorer">
          <table>
            <tr>
              <td>1</td>
              <td>Spieler Name</td>
              <td>Team Name</td>
              <td>25</td>   <!-- Tore -->
              <td>10</td>   <!-- Spiele -->
            </tr>
          </table>
        </div>
      `;
            const result = service.parseHtmlToScorer(html);

            expect(result.length).toBe(1);
            expect(result[0].name).toBe('Spieler Name');
            expect(result[0].birthYear).toBe('');
            expect(result[0].goals).toBe(25);
            expect(result[0].games).toBe(10);
        });
    });
});
