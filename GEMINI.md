# GEMINI.md

This file provides a comprehensive overview of the **Wasserball-Tabelle** project, intended to be used as a primary source of information for development and maintenance.

## Project Overview

**Wasserball-Tabelle** is a web application for managing and displaying water polo league tables, games, and scorers. It is built using Angular and Angular Material, and it retrieves real-time data from the official German Swimming Federation (DSV) website.

The application features an overview of all available leagues, a detailed view for each league with a schedule, table, and top scorers, and a game details view with comprehensive information about each match.

### Key Technologies

*   **Framework**: Angular
*   **UI Library**: Angular Material
*   **Language**: TypeScript
*   **Styling**: SCSS
*   **Package Manager**: npm
*   **Data Source**: [https://dsvdaten.dsv.de](https://dsvdaten.dsv.de) (proxied via `/api`)

### Architecture

The project follows a standard Angular architecture, with a clear separation of components, services, and models.

*   **Components**: The application is divided into several components, each responsible for a specific view or UI element. The main components are `OverviewComponent`, `LigaComponent`, and `GameDetailsComponent`.
*   **Services**: Services are used to encapsulate business logic and data fetching. The `ApiProxyService` is responsible for constructing the API URL, while other services (`LigaService`, `GameDetailsService`, `OverviewService`) fetch and process the data.
*   **Routing**: The application uses the Angular Router to navigate between different views. The routes are defined in `src/app/app.routes.ts`.

## Building and Running

### Development Server

To run the application in a development environment, use the following command:

```bash
ng serve
```

This will start a development server on `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

### Build

To build the project for production, use the following command:

```bash
ng build
```

The build artifacts will be stored in the `dist/` directory.

### Running Unit Tests

To run the unit tests, use the following command:

```bash
ng test
```

This will execute the unit tests via Karma. For CI/CD pipelines, use headless mode:

```bash
ng test -- --watch=false --browsers=ChromeHeadless
```

## Development Conventions

### Coding Style

The project follows the standard Angular coding style. The code is written in TypeScript and uses SCSS for styling.

### Testing Practices

The project includes unit tests for the main components and services. The tests are written using Jasmine and executed with Karma.

### Contribution Guidelines

Contributions are welcome. To contribute, please fork the repository, create a new branch, make your changes, and open a pull request.
