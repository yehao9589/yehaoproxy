# YehaoProxy

<p align="center">
  <strong>An integrated operations platform for proxy IP and node-service businesses</strong>
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-v1.0.0-2563eb">
  <img alt="Node" src="https://img.shields.io/badge/Node.js-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white">
  <img alt="MySQL" src="https://img.shields.io/badge/MySQL-5.7%20%7C%208.x-4479a1?logo=mysql&logoColor=white">
</p>

<p align="center">
  <a href="./README.md">中文</a> · <strong>English</strong>
</p>

YehaoProxy brings storefront sales, customers, orders, billing, payments, provisioning, renewals, after-sales service, credit billing, notifications, auditing, and operations into one system. It is designed for proxy IPs, computer nodes, router relay services, and other recurring network products.

## Highlights

| Area | Capabilities |
| --- | --- |
| Products and sales | Product types, regional pricing, fixed-day/calendar-month billing, stock, coupons, and batch ordering |
| Customer portal | Orders, proxy assets, node subscriptions, service requests, wallet, credit bills, transactions, notifications, and tickets |
| Operations | Product orders, renewal verification, service management, manual provisioning, IP replacement, and traffic reset |
| Finance | Billing, transaction ledger, wallet/credit payments, Alipay checkout, original-route or wallet refunds |
| Automation | Expiry reminders, stock alerts, customer/admin email, scheduled jobs, and auto-renewal |
| Administration | Role permissions, customer impersonation, audit logs, real client IP capture, backup, and recovery |
| Integrations | X-Panel node management, traffic synchronization, subscription URLs, and QR codes |

## Recommended Deployment

For Baota deployments, use Baota MySQL with one YehaoProxy Docker container:

```text
Internet → Nginx / HTTPS → YehaoProxy :3000 → Baota MySQL :3306
```

- Use [`docker-compose.single.yml`](./docker-compose.single.yml).
- Keep Baota MySQL restricted to `Localhost`; never expose port `3306` publicly.
- Run the first-time installer at `/install` and use `127.0.0.1` as the database host.
- Internal service and asset-encryption secrets are generated and persisted automatically.
- `data`, `uploads`, and `backups` are mounted on the host and survive container recreation.

See the Chinese [deployment guide](./DEPLOYMENT.md) for the complete procedure and the [v1.0.0 release checklist](./RELEASE_CHECKLIST.md) before production rollout.

## Quick Start

Use [`docker-compose.single.yml`](./docker-compose.single.yml) in Baota and provide a minimal `.env` file:

```dotenv
YEHAOPROXY_IMAGE=ghcr.io/yehao9589/yehaoproxy:v1.0.0
PUBLIC_APP_URL=https://your-domain.example
APP_VERSION=v1.0.0
CRON_INTERVAL_MS=60000
```

Then open:

```text
https://your-domain.example/install
```

The installer tests the database connection, creates the schema, configures the site, and provisions the first super administrator.

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Run the complete quality gate before committing:

```bash
pnpm run check
```

It runs ESLint, TypeScript checks, a production build, and the critical business regression suite.

## Requirements

- Node.js `>= 22.13.0`
- pnpm `11.x`
- Docker and Docker Compose
- MySQL `5.7` or `8.x`; MySQL 8 is recommended for production

## Project Layout

```text
app/                         Pages, components, and API routes
db/                          Drizzle schema and database adapters
lib/                         Authentication, payments, billing, and shared services
scripts/                     Single-container controller, bridges, migrations, jobs, and backups
public/                      Static assets, uploads, and release manifest
docker-compose.single.yml    Recommended Baota single-container stack
DEPLOYMENT.md                Deployment and operations guide
RELEASE_CHECKLIST.md         Production release acceptance checklist
```

## Data, Security, and Updates

- Back up Baota MySQL and all three persistent directories before every update.
- Pin production to a versioned image; do not use moving `latest` or `pre-release` tags.
- Configure a production domain and HTTPS before enabling payment callbacks and email links.
- Rehearse payments, refunds, backup restoration, and external provider integration in staging.
- Backup archives contain database content and sensitive configuration; encrypt and store them off-site.

## License

This is currently a private project. Copying, redistribution, or commercial deployment requires authorization from the project owner.
