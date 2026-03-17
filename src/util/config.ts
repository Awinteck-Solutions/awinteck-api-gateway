import * as dotenv from 'dotenv';
import path from 'path';


if (process.env.NODE_ENV !== "production") {
    dotenv.config({ path: ".env.gateway" });
} else { 
    dotenv.config({ path: path.resolve(__dirname, `../../.env.dev`) });
}

export const config = {
    port: process.env.PORT || 9000,
    authServiceUrl: process.env.AUTH_SERVICE_URL || '',
    inventoryServiceUrl: process.env.INVENTORY_SERVICE_URL || '',
    invoiceServiceUrl: process.env.INVOICE_SERVICE_URL || '',
    // templateServiceUrl: process.env.TEMPLATE_SERVICE_URL || '',
    ibulkServiceUrl: process.env.IBULK_SERVICE_URL || '',
};