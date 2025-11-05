# WaterpoloTable

This project is a web application for managing and displaying water polo league tables, games, and scorers. It is built using Angular and Angular Material.

## Table of Contents

- [Installation](#installation)
- [Development Server](#development-server)
- [Code Scaffolding](#code-scaffolding)
- [Build](#build)
- [Running Unit Tests](#running-unit-tests)
- [Running End-to-End Tests](#running-end-to-end-tests)
- [Further Help](#further-help)
- [Project Structure](#project-structure)
- [Features](#features)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Installation

To install this project, clone the repository and install the dependencies using npm:

```bash
git clone https://github.com/Mauritz-Langer/Wasserball-Tabelle.git
cd Wasserball-Tabelle
npm install
```

## Development Server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

```bash
ng serve
```

## Code Scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

```bash
ng generate component component-name
```

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

```bash
ng build
```

## Running Unit Tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

```bash
ng test
```

## Running End-to-End Tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

```bash
ng e2e
```

## Further Help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Developer Documentation

For detailed information about the project architecture, coding conventions, and best practices, please refer to the **[Copilot Instructions](.github/copilot-instructions.md)**. This comprehensive guide includes:

- Complete project architecture overview
- Data models and their usage
- HTML scraping patterns
- Styling conventions and responsive design
- Common problems and solutions
- Best practices for extending the project

## Project Structure

The project structure is as follows:

```
waterpolotable/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   └── liga/
│   │   │       ├── liga.component.html
│   │   │       ├── liga.component.scss
│   │   │       └── liga.component.ts
│   │   ├── models/
│   │   │   ├── games.ts
│   │   │   ├── table.ts
│   │   │   └── scorer.ts
│   │   ├── services/
│   │   │   └── liga/
│   │   │       └── liga.service.ts
│   │   └── app.module.ts
│   ├── assets/
│   ├── environments/
│   ├── index.html
│   ├── main.ts
│   └── styles.scss
├── .gitignore
├── angular.json
├── package.json
├── README.md
└── tsconfig.json
```

## Features

### Overview
- Browse all available water polo leagues
- Favorite leagues for quick access
- Organized by categories (Bundesliga, Oberliga, etc.)

### League View
- **Games Schedule**: Complete list of all games with dates and results
- **League Table**: Current standings with wins, losses, goals, and points
- **Top Scorers**: Leading goal scorers in the league
- Filter functionality for games and scorers
- Expandable team details in league table

### Game Details (NEW! 🎉)
- **Comprehensive Game Information**:
  - Team details (coaches, captains, best players)
  - Quarter-by-quarter scores
  - Complete event timeline (goals, penalties)
  - Officials (referees, timekeepers, secretaries)
  - Game statistics (when available)
- **Interactive Features**:
  - Google Maps integration for venue location
  - Video links (when available)
  - Protocol/PDF downloads
  - Responsive design for all devices

### Technical Features
- Responsive design for mobile, tablet, and desktop
- Real-time data from DSV (Deutscher Schwimm-Verband)
- Material Design UI
- Fast navigation between views
- Error handling and loading states
- Responsive design for different devices.
- Expandable rows for detailed game information.
- Navigation to external maps links.

## Usage

1. **Navigate to the Application:**
   Open your browser and go to `http://localhost:4200/`.

2. **Filter Games and Scorers:**
   Use the filter text fields to search for specific games or scorers.

3. **Expand Rows:**
   Click on a row to expand and view detailed information about the games.

4. **Navigate to Maps:**
   Click on the location link to navigate to the map for the game location.

## Contributing

Contributions are welcome! Please follow these steps to contribute:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Make your changes.
4. Commit your changes (`git commit -m 'Add some feature'`).
5. Push to the branch (`git push origin feature-branch`).
6. Open a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
