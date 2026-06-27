# Ignition API

NestJS backend for the Ignition Pay ecosystem.

## Installation

```bash
npm install
```

## Running

```bash
# development
npm run start:dev

# production
npm run start:prod
```

## Environment

Copy `.env.example` to `.env` and fill in the values.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /payments | Initiate a payment |
| POST | /addresses/verify | Verify a Stellar address |
| GET | /transactions | List transactions |
| GET | /health | Health check |

## Architecture

- **NestJS** — framework
- **Prisma** — ORM
- **Redis** — queues and caching
- **JWT** — authentication
