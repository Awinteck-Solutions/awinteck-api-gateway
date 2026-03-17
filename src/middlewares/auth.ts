import axios from 'axios';
import express from 'express';
import { GatewayRequest } from '../util/GatewayRequest';
import dotenv from 'dotenv';
dotenv.config();

const PUBLIC_PATHS: Array<RegExp> = [
  /^\/health(?:\/|$)/,
  /^\/auth\/api\/register(?:\/|$)/,
  /^\/auth\/api\/token(?:\/|$)/,
];

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:9001';
/**
 * 1. Checks for Authorization header (API Key or JWT).
 * 2. Calls the internal Auth Service to validate the key/token.
 * 3. Attaches developer data (ID, Tier) to the request object.
 */


export const authenticateApiKey = async (req: GatewayRequest, res: express.Response, next: express.NextFunction) => {
    const path = req.originalUrl || req.url;
    if (PUBLIC_PATHS.some((re) => re.test(path))) {
        return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || (typeof authHeader === 'string' && !authHeader.startsWith('Bearer '))) {
        return res.status(401).json({ error: 'Authorization header (Bearer JWT) required.' });
    }

    try {
        // Send the raw key/token to the dedicated Auth Service for validation
        const validationResponse = await axios.post(`${AUTH_SERVICE_URL}/api/validate`, null, {
            headers: {
                'Authorization': authHeader
            },
            timeout: 5000,
        });

        const { developerId, subscriptionTier, service } = validationResponse.data;

        // CRITICAL STEP: Attach the validated ID and Tier to the request object
        // This data will be used by the Rate Limiter and propagated to the downstream microservices
        req.developerId = developerId;
        req.subscriptionTier = subscriptionTier;
        req.service = service;

        // Proceed to the next middleware (Rate Limiting)
        next();

    } catch (error: any) {
        const status = error?.response?.status;
        if (status === 401) {
            return res.status(401).json({ error: 'Invalid or expired token.' });
        }
        if (!status) {
            return res.status(503).json({ error: 'Auth service unavailable.' });
        }
        return res.status(401).json({ error: 'Token validation failed.' });
    }
};

// export { authenticateApiKey };