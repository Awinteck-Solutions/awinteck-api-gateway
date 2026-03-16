import * as dotenv from 'dotenv';
import path from 'path';


const envFile = process.env.NODE_ENV === 'production' ? '.env.gateway' : '.env.dev';
dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

export const config = {
    port: process.env.PORT || 9000,
    authServiceUrl: process.env.AUTH_SERVICE_URL || '',
    inventoryServiceUrl: process.env.INVENTORY_SERVICE_URL || '',
    invoiceServiceUrl: process.env.INVOICE_SERVICE_URL || '',
    templateServiceUrl: process.env.TEMPLATE_SERVICE_URL || '',
    ibulkServiceUrl: process.env.IBULK_SERVICE_URL || '',
};