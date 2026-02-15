
# BillEase Backend

Minimal Express.js backend for UPI collections via Decentro API.

## Setup

1. Install dependencies:
```bash
cd server
npm install
npm run dev 
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Update .env with your Decentro credentials:
```
DECENTRO_CLIENT_ID=your_client_id
DECENTRO_CLIENT_SECRET=your_client_secret
DECENTRO_MODULE_SECRET=your_module_secret
DECENTRO_PROVIDER_SECRET=your_provider_secret
DECENTRO_BASE_URL=https://in.staging.decentro.tech
PORT=3001
```

## Running

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

## Endpoints

- `POST /collect` - Create UPI collection request
- `POST /webhook` - Handle Decentro webhooks
- `GET /status/:transactionId` - Check transaction status
- `GET /health` - Health check

## Usage

The frontend will automatically connect to this backend when creating UPI collection requests.
