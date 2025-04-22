<img src="https://sales.equalify.app/equalifyv2.png" alt="Equalify Logo" width="100">

# Equalify v2 API

Equalify aims to be the most useful accessibility platform, featuring faster scanning, more accurate results, and an intuitive user interface. This repository contains the source code for the Equalify v2 API, the backend service powering the platform. We publish our code under an open-source license to encourage collaboration and community contributions.

**Together, we can equalify the internet.**

## Overview

The Equalify v2 API is the central backend service for the Equalify accessibility platform. It handles user authentication, account management, audit creation and management, scan initiation, results processing, and data persistence.

This represents a significant refactor ("V2") from previous versions, introducing core concepts like **Audits** (replacing scans/reports) and **multi-user accounts**.

## Architecture & Tech Stack

* **Language:** TypeScript
* **Runtime:** Node.js
* **Deployment:** AWS Lambda Function URL
* **Dependencies:** Interacts with a separate `equalify-scan` service to perform accessibility scans. Uses a PostgreSQL database (via Hasura for GraphQL access) for persistence. Integrates with Stripe for account upgrades and subscriptions.

## Key Concepts (V2)

Understanding these concepts is crucial for working with the v2 API:

* **Audits:** The central unit of work. Audits define the scope (pages, accessibility checks), frequency, and notification settings for accessibility scanning. They replace the older concepts of "reports" and "scans".
* **Blockers:** Individual accessibility violations found during a scan. Each blocker relates to a specific accessibility issue, a page element (`Blocker Code`, formerly "node"), a check, and an audit.
* **Equalified/Unequalified:** The status of a blocker. A blocker is "Equalified" when it's resolved (no longer detected in subsequent scans) and "Unequalified" if it persists or reappears.
* **Ignored Blockers:** Users can mark specific blockers as `ignored`, preventing them from affecting audit progress metrics and potentially bypassing them in future scans.
* **Multi-User Accounts:** Organizations can have multiple users associated with their account, each potentially having different roles or permissions.
* **Scan Quota:** Accounts have limits on the number or frequency of scans they can perform, managed via account settings and potentially tied to subscription tiers.
* **Logs:** Track significant events within the system, such as audit creation, scan initiation/completion, and blocker status changes. Logs can be associated with specific audits or pages.

## API Endpoint Overview

The API provides endpoints grouped by functionality (based on issue #520 planning):

* **Authentication:** `/authenticate`, `/createUser`
* **Audits:** Creating (`/saveAudit`), retrieving (`/audit`, `/audits`), updating (`/saveAudit`), running scans (`/runScan`, `/runAudits`), managing results (`/auditResults`), tracking progress (`/auditProgress`), managing blockers (`/ignoreBlockers`).
* **Pages:** Listing (`/pages`), viewing details (`/page`), managing view options (`/pagesSearchOptions`).
* **Logs:** Retrieving logs (`/logs`, `/logDetails`).
* **Account Management:** Retrieving account info (`/account`, `/accountInfo`, `/accountQuota`), managing users (`/addUser`, `/updateUser`), handling upgrades (`/upgradeAccount`).
* **Checks:** Querying available checks (`/scanChecks`).

*(Refer to the [API Documentation](https://docsv2.equalify.app/) for detailed endpoint specifications.)*

## Important Links

* **API Documentation:** [docsv2.equalify.app](https://docsv2.equalify.app/)
* **Production Environment:** [apiv2.equalify.app](https://apiv2.equalify.app/)
* **Staging Environment:** [apiv2.equalify.dev](https://apiv2.equalify.dev/)
* **Local Development URL:** `http://localhost:3000`

## Getting Started

### Prerequisites

* Node.js (Check `.nvmrc` or `package.json` for version)
* Yarn (`npm install -g yarn`)
* Access to required environment variables (see below)
* (Potentially) AWS CLI configured, depending on local setup needs.

### Setup

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/EqualifyEverything/equalify-v2-api.git](https://github.com/EqualifyEverything/equalify-v2-api.git)
    cd equalify-v2-api
    ```
2.  **Install dependencies:**
    ```bash
    yarn install
    ```
3.  **Configure Environment Variables:**
    * Create `.env.staging` and/or `.env.production` files in the root directory. You might want to start by copying from an `.env.example` file if one exists.
    * These files require secrets and configuration values. **You will need to ask a project maintainer for access to the correct values.**
    * Common variables needed include:
        * AWS Credentials (Key, Secret, Region)
        * Cognito User Pool ID & Client ID(s)
        * Database Connection String/Details
        * Stripe API Keys (Public and Secret)
        * URLs for related services (e.g., `equalify-scan`)
4.  **Start your local server:**
    * To run against staging configurations:
        ```bash
        yarn start:staging
        ```
    * To run against production configurations (use with caution):
        ```bash
        yarn start:prod
        ```
    Your local API should now be accessible at `http://localhost:3000`.
5.  **Start developing!**

## Contribute

We welcome contributions! Please follow these steps:

1.  Report bugs, ask questions, or propose features via the repository's [Issues tab](https://github.com/EqualifyEverything/equalify-v2-api/issues).
2.  If submitting code changes via a Pull Request, please first read our contribution guidelines:
    * [CONTRIBUTING.md](https://github.com/EqualifyEverything/equalify/blob/main/CONTRIBUTE.md)
    * [ACCESSIBILITY.md](https://github.com/EqualifyEverything/equalify/blob/main/ACCESSIBILITY.md)

## License

This project's code is published under the GNU Affero General Public License v3.0