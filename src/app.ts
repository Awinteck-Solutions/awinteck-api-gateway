// src/app.ts

import express, { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authenticateApiKey } from './middlewares/auth';
import { enforceRateLimit } from './middlewares/rateLimit';
import { GatewayRequest } from './util/GatewayRequest';
import dotenv from 'dotenv';
dotenv.config();
// GET PRODUCTION OR LOCAL ENVIRONMENT VARIABLES
const normalizeServiceUrl = (raw: string | undefined, envName: string): string => {
    const cleaned = String(raw ?? '').trim().replace(/^['"]|['"]$/g, '');
    if (!cleaned) {
        throw new Error(`Missing environment variable: ${envName}`);
    }
    try {
        return new URL(cleaned).toString().replace(/\/$/, '');
    } catch {
        throw new Error(`Invalid URL in ${envName}: ${raw}`);
    }
};

const authServiceUrl = normalizeServiceUrl(process.env.AUTH_SERVICE_URL, 'AUTH_SERVICE_URL');
const inventoryServiceUrl = normalizeServiceUrl(process.env.INVENTORY_SERVICE_URL, 'INVENTORY_SERVICE_URL');
const invoiceServiceUrl = normalizeServiceUrl(process.env.INVOICE_SERVICE_URL, 'INVOICE_SERVICE_URL');
const ibulkServiceUrl = normalizeServiceUrl(process.env.IBULK_SERVICE_URL, 'IBULK_SERVICE_URL');
const port = process.env.PORT;

console.log('authServiceUrl', authServiceUrl);
console.log('inventoryServiceUrl', inventoryServiceUrl);
console.log('invoiceServiceUrl', invoiceServiceUrl);
console.log('ibulkServiceUrl', ibulkServiceUrl);
console.log('port', port);
if (!port) {
    throw new Error('Missing environment variables');
}


const app = express();

const PUBLIC_PATHS: Array<RegExp> = [
    /^\/health(?:\/|$)/,
    /^\/auth(?:\/|$)/, // allow auth service paths (register/token/validate/etc.)
];

// log request body
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log('Request URL:', req.url);
    console.log('Request Method:', req.method);
    next();
});


// Map paths to service URLs using a type annotation
const serviceMap: { [key: string]: string } = {
    '/inventory': inventoryServiceUrl,
    '/invoice': invoiceServiceUrl,
    '/auth': authServiceUrl,
    '/ibulk': ibulkServiceUrl,
};

// --- 1. Global Middleware ---

// Use type assertions to inform Express about our custom request object
// Cast through 'any' first to bypass TypeScript's strict type checking for Express middleware
app.use(authenticateApiKey as any as (req: Request, res: Response, next: NextFunction) => void); 
app.use(enforceRateLimit as any as (req: Request, res: Response, next: NextFunction) => void);


// Enforce service-level access for non-auth routes.
app.use((req: Request, res: Response, next: NextFunction) => {
    const path = req.originalUrl || req.url;
    if (PUBLIC_PATHS.some((re) => re.test(path))) {
        return next();
    }

    const gatewayReq = req as GatewayRequest;
    const claimedService = (gatewayReq.service || '').replace(/^\//, '').toLowerCase();

    const firstSegment = (path.split('?')[0] || '').split('/').filter(Boolean)[0] || '';
    const requestedRoot = `/${firstSegment.toLowerCase()}`;

    if (!serviceMap[requestedRoot]) {
        return res.status(404).json({ error: 'Unknown service route.', route: requestedRoot });
    }
    if (!claimedService) {
        return res.status(401).json({ error: 'Token is missing required service claim.' });
    }

    const allowedRoot = `/${claimedService}`;
    if (requestedRoot !== allowedRoot) {
        return res.status(403).json({
            error: 'Forbidden: token not entitled for this service.',
            allowedService: allowedRoot,
            requestedService: requestedRoot,
        });
    }

    next();
});

// --- 2. Microservice Routing (The Proxy Configuration) ---

// Define the function to propagate identity headers
const onProxyReq = (proxyReq:any, req:any, res:any) => {
    const gatewayReq = req as GatewayRequest;
    
    // IMPORTANT: Propagate the validated Developer ID and Tier to the service
    if (gatewayReq.developerId) proxyReq.setHeader('x-developer-id', gatewayReq.developerId);
    if (gatewayReq.subscriptionTier) proxyReq.setHeader('x-subscription-tier', gatewayReq.subscriptionTier);
    if ((gatewayReq as any).service) proxyReq.setHeader('x-service', (gatewayReq as any).service);
};

// Create and apply proxy rules
for (const [path, target] of Object.entries(serviceMap)) {
    app.use(
        path,
        createProxyMiddleware({
            target: target,
            changeOrigin: true,
            pathRewrite: (p) => p.replace(path, ''),
            on: {
                proxyReq: onProxyReq,
            }
        })
    );
}



// Simple health check route
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'API Gateway Operational' });
});

app.listen(port, () => {
    console.log(`API Gateway running on port ${port}`);
});