import { Request } from 'express';

export interface GatewayRequest extends Request {
    developerId: string;
    subscriptionTier: string;
    service: string;
}
