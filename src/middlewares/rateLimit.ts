import express from 'express';
import { GatewayRequest } from '../util/GatewayRequest';

const PUBLIC_PATHS: Array<RegExp> = [
    /^\/health(?:\/|$)/,
    /^\/auth\/health(?:\/|$)/,
  /^\/auth\/api\/register(?:\/|$)/,
  /^\/auth\/api\/token(?:\/|$)/,
];

const TIER_LIMITS: Record<string, number> = {
  BASIC: 10,
  PRO: 100,
  ENTERPRISE: 501,
};

type Usage = { count: number; resetTime: number };
const usageStore = new Map<string, Usage>();
const WINDOW_DURATION_MS = 60 * 1000; // 1 minute window

/**
 * Checks the usage counter for the developer ID and enforces the limit
 */

const enforceRateLimit = (req: GatewayRequest, res: express.Response, next: express.NextFunction) => {
    const path = req.originalUrl || req.url;
    if (PUBLIC_PATHS.some((re) => re.test(path))) {
        return next();
    }

    const developerId = req.developerId;
    const subscriptionTier = (req.subscriptionTier || 'BASIC').toUpperCase(); // Default to basic if missing
    const limit = TIER_LIMITS[subscriptionTier] ?? TIER_LIMITS.BASIC;

    if (!developerId) {
        // Should be caught by auth middleware, but a safeguard
        return res.status(500).json({ error: 'Developer ID missing after authentication.' });
    }

    const now = Date.now();
    let developerUsage = usageStore.get(developerId);

    // 1. Check if the usage window has expired
    if (!developerUsage || developerUsage.resetTime <= now) {
        // Start a new window
        developerUsage = {
            count: 1,
            resetTime: now + WINDOW_DURATION_MS,
        };
        usageStore.set(developerId, developerUsage);
        // Continue to the proxy
        return next();
    }

    // 2. Check if the limit has been exceeded
    if (developerUsage.count >= limit) {
        const resetSeconds = Math.ceil((developerUsage.resetTime - now) / 1000);
        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', developerUsage.resetTime);
        res.setHeader('Retry-After', resetSeconds);
        return res.status(429).json({ 
            error: 'Rate limit exceeded.', 
            retryAfter: `${resetSeconds} seconds`
        });
    }

    // 3. Increment counter and continue
    developerUsage.count++;
    usageStore.set(developerId, developerUsage);
    
    // Set informative headers for the developer
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', limit - developerUsage.count);
    res.setHeader('X-RateLimit-Reset', developerUsage.resetTime);
    
    next();
};

export { enforceRateLimit };