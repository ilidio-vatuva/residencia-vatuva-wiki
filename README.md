# residencia-vatuva-wiki

Wiki.js instance for Residência Vatuva.

## Prerequisites

- **Node.js** v18+
- **PostgreSQL** 9.5+

## Setup

The Wiki.js files live in the `wiki/` directory. The PostgreSQL database is configured as:

| Setting  | Value     |
|----------|-----------|
| Host     | localhost |
| Port     | 5432      |
| User     | wikijs    |
| Password | wikijs    |
| Database | wiki      |

Configuration file: `wiki/config.yml`

## Running

```bash
./start.sh
```

Or manually:

```bash
cd wiki && node server
```

Wiki.js will be available at **http://localhost:8080**.

On first launch, you'll be guided through the setup wizard to create your admin account.