# YehaoProxy

<p align="center">
  <a href="./README.md">中文</a> · <strong>English</strong>
</p>

YehaoProxy is a full-stack business management system for selling proxy IP and node services. It covers storefront sales, customer accounts, orders and invoices, manual provisioning, renewals, after-sales requests, finance, notifications, auditing, VPS/X-Panel integration, online updates, backups, and disaster recovery.

> This project is under active development. Before production deployment, validate the complete payment, provisioning, renewal, refund, backup, and recovery workflows in a staging environment.

## Features

- Product management for proxy IPs, computer nodes, router relay services, and custom product types
- Customer portal for orders, invoices, services, wallet activity, tickets, and after-sales requests
- Operations for product orders, renewal orders, service management, and manual provisioning
- Finance tools for transaction records, billing, wallet recharge, and coupons
- Service features including auto-renewal, IP replacement, traffic reset, subscription URLs, and QR codes
- Scheduled jobs, email/SMS notifications, audit logs, and administrator permissions
- X-Panel integration for VPS traffic synchronization and inbound-node inspection
- MySQL 8 and SQLite/D1 deployment modes
- Pre-update backups, automatic rollback, manual backup, download, import, and recovery

## Requirements

- Node.js `>= 22.13.0`
- pnpm `11.x`
- Docker and Docker Compose are recommended
- MySQL `8.4` is recommended for MySQL deployments

## Docker Deployment

### 1. Clone the repository

```bash
git clone https://github.com/yehao9589/yehaoproxy.git
cd yehaoproxy
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

At minimum, replace these values before production use:

- `INVENTORY_ENCRYPTION_KEY`
- `MYSQL_ROOT_PASSWORD`
- `MYSQL_PASSWORD`
- `MYSQL_BRIDGE_SECRET`
- Scheduler, updater, and X-Panel bridge secrets in Docker Compose

Use long random values and never commit real secrets to Git.

### 3. Start the services

MySQL deployment (recommended):

```bash
docker compose --profile mysql --profile system-update up -d --build
```

SQLite deployment:

```bash
docker compose --profile system-update up -d --build
```

### 4. Run first-time installation

Open:

```text
http://your-server:3000/install
```

The installer lets you select a database, test the MySQL connection, initialize tables, set the site name, and create the first super administrator.

After installation:

- Storefront: `http://your-server:3000/`
- Customer portal: `http://your-server:3000/dashboard`
- Administration: `http://your-server:3000/admin`

## Local Development

```bash
pnpm install
pnpm dev
```

Useful commands:

```bash
pnpm build       # Verify the production build
pnpm test        # Run project tests
pnpm lint        # Run code checks
pnpm db:generate # Generate Drizzle migrations
```

## Database Modes

- MySQL is recommended for production and multi-container deployments.
- SQLite/D1 is suitable for lightweight deployments, development, or Cloudflare environments.
- Both modes use the same business layer, but database switching requires a migration and a verified backup.
- Do not overwrite MySQL with a copied SQLite file. Use the installer, migration scripts, or the backup and recovery workflow.

## Backup and Recovery

Go to `System Management → Updates & Backups` in the administration panel to:

- Create a complete system backup
- Download a `.tar.gz` backup archive
- Import an existing backup
- Restore the database, uploaded files, and critical configuration
- Create backups before updates and automatically roll back failed updates

Backup archives contain database content and sensitive configuration. Store them securely and copy them regularly to an off-site or object-storage location.

## Project Structure

```text
app/                 Pages, components, and API routes
db/                  Drizzle schema and database adapters
drizzle/             Database migrations
lib/                 Business services and shared utilities
scripts/             Scheduler, MySQL/X-Panel bridges, and update runner
public/uploads/      Uploaded site assets
docker-compose.yml   Docker service orchestration
```

## Security Recommendations

- Replace every example password and default secret in production.
- Restrict update, recovery, finance, and permission management to trusted administrators.
- Configure HTTPS, a reverse proxy, firewall rules, and database access controls.
- Download backups regularly and test the recovery procedure.
- Validate callback signatures, idempotency, and refund handling before enabling production payments.

## License

This is currently a private project. Copying, redistribution, or commercial deployment requires authorization from the project owner.
